import {
  BadRequestException,
  Injectable,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import {
  businessPeriodBounds,
  expenseExceedsDrawer,
  expenseOverDrawerMessage,
  formatMoney,
  isCashExpenseCategory,
  managerDrawerBalance,
  roundMoney4,
  type CashCollectionRow,
  type CashExpenseCategory,
  type CashExpenseRow,
  type CashFlowReport,
  type CashierCashSaleRow,
  type DrawerPerson,
  type CashSubmissionToday,
  type ManagerDrawerBalance,
  type RecordCashExpenseRequest,
  type RecordManagerDrawerOpeningRequest,
} from "@blackbox/shared";
import { DataSource, Repository } from "typeorm";
import type { TenantContext } from "../common/tenant-context";
import {
  CashExpense,
  ManagerDrawerOpening,
  ManagerDrawerSubmission,
  User,
} from "../db/entities";
import { ActivityLogService } from "../activity-log/activity-log.service";

function num(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function roundMoney(value: number): number {
  return roundMoney4(Number.isFinite(value) ? value : 0);
}

@Injectable()
export class CashFlowService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(CashExpense)
    private readonly expenses: Repository<CashExpense>,
    @InjectRepository(ManagerDrawerOpening)
    private readonly openings: Repository<ManagerDrawerOpening>,
    @InjectRepository(ManagerDrawerSubmission)
    private readonly submissions: Repository<ManagerDrawerSubmission>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly activityLog: ActivityLogService,
  ) {}

  seesEveryDrawer(permissions: readonly string[]): boolean {
    return permissions.includes("web.access");
  }

  async report(
    user: TenantContext,
    from: string,
    to: string,
  ): Promise<CashFlowReport> {
    let bounds;
    try {
      bounds = businessPeriodBounds(from, to);
    } catch {
      throw new BadRequestException("Invalid date range");
    }
    const seeAll = this.seesEveryDrawer(user.permissions);
    const managerName = await this.managerName(user.tenantId, user.userId);
    const [cashierCashSales, collections, expenses, drawers] = await Promise.all([
      this.cashierCash(user.tenantId, bounds.from, bounds.to, bounds.startIso, bounds.endIso),
      this.collections(user.tenantId, user.userId, seeAll, bounds.startIso, bounds.endIso),
      this.expenseRows(user.tenantId, user.userId, seeAll, bounds.startIso, bounds.endIso),
      this.drawerBalances(user.tenantId, user.userId, managerName, seeAll),
    ]);
    return {
      periodFrom: bounds.from,
      periodTo: bounds.to,
      cashierCashSales,
      collections,
      expenses,
      drawers,
    };
  }

  async record(
    user: TenantContext,
    body: RecordCashExpenseRequest,
  ): Promise<CashExpenseRow> {
    if (!isCashExpenseCategory(body.category)) {
      throw new BadRequestException("Choose a category");
    }
    if (!(body.amount > 0)) {
      throw new BadRequestException("Enter an amount greater than zero");
    }
    const managerName = await this.managerName(user.tenantId, user.userId);
    const drawers = await this.drawerBalances(
      user.tenantId,
      user.userId,
      managerName,
      false,
    );
    const available =
      drawers.find((row) => row.managerUserId === user.userId)?.balance ?? 0;
    if (expenseExceedsDrawer(body.amount, available)) {
      throw new BadRequestException(expenseOverDrawerMessage(available));
    }
    const now = new Date();
    const row = this.expenses.create({
      tenantId: user.tenantId,
      recordedByUserId: user.userId,
      recordedByName: managerName,
      category: body.category,
      amount: String(body.amount),
      note: body.note?.trim() ?? "",
      occurredAt: now,
    });
    const saved = await this.expenses.save(row);
    const amount = roundMoney(num(saved.amount));
    await this.activityLog.logFromContext({
      tenantId: user.tenantId,
      eventType: "cash_expense.recorded",
      actorUserId: user.userId,
      summary: `Recorded ${body.category} of Rs ${formatMoney(amount)}`,
      metadata: {
        expenseId: saved.id,
        category: body.category,
        amount,
      },
    });
    return {
      id: saved.id,
      at: saved.occurredAt.toISOString(),
      managerUserId: saved.recordedByUserId,
      managerName: saved.recordedByName || managerName,
      category: body.category,
      amount,
      note: saved.note,
    };
  }

  async recordOpening(
    user: TenantContext,
    body: RecordManagerDrawerOpeningRequest,
  ): Promise<{ id: string }> {
    if (!(body.amount > 0)) {
      throw new BadRequestException("Enter an amount greater than zero");
    }
    const managers = await this.listPeople(user.tenantId, "till.manage");
    const manager = managers.find((row) => row.id === body.managerUserId);
    if (!manager) {
      throw new BadRequestException("Choose a manager");
    }
    const openerName = await this.managerName(user.tenantId, user.userId);
    const managerName = manager.fullName.trim() || manager.username;
    const now = new Date();
    const saved = await this.openings.save(
      this.openings.create({
        tenantId: user.tenantId,
        managerUserId: manager.id,
        managerName,
        amount: String(body.amount),
        openedByUserId: user.userId,
        openedByName: openerName,
        openedAt: now,
      }),
    );
    const amount = roundMoney(body.amount);
    await this.activityLog.logFromContext({
      tenantId: user.tenantId,
      eventType: "drawer.opened",
      actorUserId: user.userId,
      subjectUserId: manager.id,
      summary: `${openerName} opened ${managerName}'s drawer with Rs ${formatMoney(amount)}`,
      metadata: {
        openingId: saved.id,
        managerUserId: manager.id,
        amount,
      },
    });
    return { id: saved.id };
  }

  async recordSubmission(user: TenantContext): Promise<{ id: string; amount: number }> {
    const managerName = await this.managerName(user.tenantId, user.userId);
    const drawers = await this.drawerBalances(
      user.tenantId,
      user.userId,
      managerName,
      false,
    );
    const balance =
      drawers.find((row) => row.managerUserId === user.userId)?.balance ?? 0;
    if (!(balance > 0)) {
      throw new BadRequestException("There is no cash to submit");
    }
    const amount = roundMoney(balance);
    const now = new Date();
    const saved = await this.submissions.save(
      this.submissions.create({
        tenantId: user.tenantId,
        managerUserId: user.userId,
        managerName,
        amount: String(amount),
        submittedAt: now,
      }),
    );
    await this.activityLog.logFromContext({
      tenantId: user.tenantId,
      eventType: "drawer.submitted",
      actorUserId: user.userId,
      summary: `${managerName} submitted Rs ${formatMoney(amount)} cash to the owner`,
      metadata: {
        submissionId: saved.id,
        amount,
      },
    });
    return { id: saved.id, amount };
  }

  async submissionsToday(
    tenantId: string,
    today: string,
  ): Promise<CashSubmissionToday[]> {
    const rows = await this.dataSource.query<
      { manager_user_id: string; manager_name: string; amount: string }[]
    >(
      `select s.manager_user_id,
              max(s.manager_name) as manager_name,
              coalesce(sum(s.amount), 0) as amount
       from manager_drawer_submissions s
       where s.tenant_id = $1
         and date(s.submitted_at) = $2::date
       group by s.manager_user_id
       order by max(s.manager_name)`,
      [tenantId, today],
    );
    return rows.map((row) => ({
      managerUserId: row.manager_user_id,
      managerName: row.manager_name?.trim() || "Manager",
      amount: roundMoney(num(row.amount)),
    }));
  }

  async listPeople(tenantId: string, permissionKey: string): Promise<DrawerPerson[]> {
    const rows = await this.dataSource.query<
      { id: string; full_name: string; username: string }[]
    >(
      `select distinct u.id, u.full_name, u.username
       from users u
       join user_roles ur on ur.user_id = u.id and ur.tenant_id = u.tenant_id
       join role_permissions rp on rp.role_id = ur.role_id
       join permissions p on p.id = rp.permission_id
       where u.tenant_id = $1
         and u.is_active = true
         and p.key = $2
       order by u.full_name`,
      [tenantId, permissionKey],
    );
    return rows.map((row) => ({
      id: row.id,
      fullName: row.full_name,
      username: row.username,
    }));
  }

  async drawerBalances(
    tenantId: string,
    userId: string,
    managerName: string,
    seeAll: boolean,
  ): Promise<ManagerDrawerBalance[]> {
    const signedInName = managerName.trim()
      ? managerName.trim()
      : await this.managerName(tenantId, userId);
    let collected: {
      manager_user_id: string;
      manager_name: string;
      named_at: string | Date | null;
      collected: string;
    }[];
    try {
      collected = await this.dataSource.query(
        `select w.withdrawn_by_user_id as manager_user_id,
                max(coalesce(nullif(trim(u.full_name), ''), nullif(trim(u.username), ''), 'Manager')) as manager_name,
                max(w.created_at) as named_at,
                coalesce(sum(w.withdrawal_total), 0) as collected
         from till_withdrawals w
         left join users u
           on u.id = w.withdrawn_by_user_id
          and u.tenant_id = w.tenant_id
         where w.tenant_id = $1
           and ($2::boolean or w.withdrawn_by_user_id = $3)
           and (
             $2::boolean = false
             or not exists (
               select 1 from till_sessions ts
               where ts.tenant_id = w.tenant_id
                 and ts.user_id = w.withdrawn_by_user_id
             )
           )
         group by w.withdrawn_by_user_id`,
        [tenantId, seeAll, userId],
      );
      // #region agent log
      fetch("http://127.0.0.1:7833/ingest/5c639e3b-d485-4142-8cf3-71119b248855",{method:"POST",headers:{"Content-Type":"application/json","X-Debug-Session-Id":"5b973a"},body:JSON.stringify({sessionId:"5b973a",runId:"post-fix",hypothesisId:"A",location:"cash-flow.service.ts:drawerBalances",message:"collected query used users.full_name",data:{rowCount:collected.length,seeAll},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
    } catch (err) {
      // #region agent log
      fetch("http://127.0.0.1:7833/ingest/5c639e3b-d485-4142-8cf3-71119b248855",{method:"POST",headers:{"Content-Type":"application/json","X-Debug-Session-Id":"5b973a"},body:JSON.stringify({sessionId:"5b973a",runId:"post-fix",hypothesisId:"A",location:"cash-flow.service.ts:drawerBalances",message:"collected query failed",data:{error:err instanceof Error?err.message:"unknown"},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      throw err;
    }
    const spent = await this.dataSource.query<
      {
        manager_user_id: string;
        manager_name: string;
        named_at: string | Date | null;
        expenses: string;
      }[]
    >(
      `select e.recorded_by_user_id as manager_user_id,
              max(coalesce(nullif(trim(e.recorded_by_name), ''), nullif(trim(u.full_name), ''), nullif(trim(u.username), ''), 'Manager')) as manager_name,
              max(e.created_at) as named_at,
              coalesce(sum(e.amount), 0) as expenses
       from cash_expenses e
       left join users u
         on u.id = e.recorded_by_user_id
        and u.tenant_id = e.tenant_id
       where e.tenant_id = $1
         and ($2::boolean or e.recorded_by_user_id = $3)
         and (
           $2::boolean = false
           or not exists (
             select 1 from till_sessions ts
             where ts.tenant_id = e.tenant_id
               and ts.user_id = e.recorded_by_user_id
           )
         )
       group by e.recorded_by_user_id`,
      [tenantId, seeAll, userId],
    );
    const openings = await this.dataSource.query<
      {
        manager_user_id: string;
        manager_name: string;
        named_at: string | Date | null;
        opening_float: string;
      }[]
    >(
      `select o.manager_user_id as manager_user_id,
              max(coalesce(nullif(trim(o.manager_name), ''), nullif(trim(u.full_name), ''), nullif(trim(u.username), ''), 'Manager')) as manager_name,
              max(o.created_at) as named_at,
              coalesce(sum(o.amount), 0) as opening_float
       from manager_drawer_openings o
       left join users u
         on u.id = o.manager_user_id
        and u.tenant_id = o.tenant_id
       where o.tenant_id = $1
         and ($2::boolean or o.manager_user_id = $3)
         and (
           $2::boolean = false
           or not exists (
             select 1 from till_sessions ts
             where ts.tenant_id = o.tenant_id
               and ts.user_id = o.manager_user_id
           )
         )
       group by o.manager_user_id`,
      [tenantId, seeAll, userId],
    );
    const tillFloats = await this.dataSource.query<
      {
        manager_user_id: string;
        till_floats: string;
      }[]
    >(
      `select t.funded_by_user_id as manager_user_id,
              coalesce(sum(t.opening_balance), 0) as till_floats
       from till_sessions t
       where t.tenant_id = $1
         and t.funded_by_user_id is not null
         and ($2::boolean or t.funded_by_user_id = $3)
         and (
           $2::boolean = false
           or not exists (
             select 1 from till_sessions ts
             where ts.tenant_id = t.tenant_id
               and ts.user_id = t.funded_by_user_id
           )
         )
       group by t.funded_by_user_id`,
      [tenantId, seeAll, userId],
    );
    const submissions = await this.dataSource.query<
      {
        manager_user_id: string;
        manager_name: string;
        named_at: string | Date | null;
        submitted: string;
      }[]
    >(
      `select s.manager_user_id as manager_user_id,
              max(coalesce(nullif(trim(s.manager_name), ''), nullif(trim(u.full_name), ''), nullif(trim(u.username), ''), 'Manager')) as manager_name,
              max(s.submitted_at) as named_at,
              coalesce(sum(s.amount), 0) as submitted
       from manager_drawer_submissions s
       left join users u
         on u.id = s.manager_user_id
        and u.tenant_id = s.tenant_id
       where s.tenant_id = $1
         and ($2::boolean or s.manager_user_id = $3)
         and (
           $2::boolean = false
           or not exists (
             select 1 from till_sessions ts
             where ts.tenant_id = s.tenant_id
               and ts.user_id = s.manager_user_id
           )
         )
       group by s.manager_user_id`,
      [tenantId, seeAll, userId],
    );
    // #region agent log
    fetch("http://127.0.0.1:7833/ingest/5c639e3b-d485-4142-8cf3-71119b248855",{method:"POST",headers:{"Content-Type":"application/json","X-Debug-Session-Id":"5b973a"},body:JSON.stringify({sessionId:"5b973a",runId:"post-fix",hypothesisId:"B",location:"cash-flow.service.ts:drawerBalances",message:"expense opening and submission queries finished",data:{expenses:spent.length,openings:openings.length,tillFloats:tillFloats.length,submissions:submissions.length},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    const map = new Map<
      string,
      {
        name: string;
        namedAt: string;
        openingFloat: number;
        collected: number;
        expenses: number;
        tillFloats: number;
        submitted: number;
      }
    >();
    const namedAtOf = (value: string | Date | null | undefined): string => {
      if (value instanceof Date) return value.toISOString();
      return value ? String(value) : "";
    };
    const touch = (id: string, name: string, namedAt: string) => {
      const trimmed = name.trim();
      const current = map.get(id) ?? {
        name: trimmed || "Manager",
        namedAt,
        openingFloat: 0,
        collected: 0,
        expenses: 0,
        tillFloats: 0,
        submitted: 0,
      };
      const laterName =
        seeAll && trimmed && namedAt && namedAt >= current.namedAt;
      if (trimmed && (current.name === "Manager" || laterName)) {
        current.name = trimmed;
        if (namedAt) current.namedAt = namedAt;
      }
      map.set(id, current);
      return current;
    };
    for (const row of collected) {
      touch(
        row.manager_user_id,
        row.manager_name,
        namedAtOf(row.named_at),
      ).collected = num(row.collected);
    }
    for (const row of spent) {
      touch(
        row.manager_user_id,
        row.manager_name,
        namedAtOf(row.named_at),
      ).expenses = num(row.expenses);
    }
    for (const row of openings) {
      touch(
        row.manager_user_id,
        row.manager_name,
        namedAtOf(row.named_at),
      ).openingFloat = num(row.opening_float);
    }
    for (const row of tillFloats) {
      touch(row.manager_user_id, "", "").tillFloats = num(row.till_floats);
    }
    for (const row of submissions) {
      touch(
        row.manager_user_id,
        row.manager_name,
        namedAtOf(row.named_at),
      ).submitted = num(row.submitted);
    }
    if (!seeAll && userId && !map.has(userId)) {
      map.set(userId, {
        name: signedInName,
        namedAt: "",
        openingFloat: 0,
        collected: 0,
        expenses: 0,
        tillFloats: 0,
        submitted: 0,
      });
    }
    return [...map.entries()]
      .map(([managerUserId, row]) => ({
        managerUserId,
        managerName: row.name,
        openingFloat: roundMoney(row.openingFloat),
        collected: roundMoney(row.collected),
        expenses: roundMoney(row.expenses),
        tillFloats: roundMoney(row.tillFloats),
        submitted: roundMoney(row.submitted),
        balance: managerDrawerBalance(row),
      }))
      .sort((a, b) => a.managerName.localeCompare(b.managerName));
  }

  private async managerName(tenantId: string, userId: string): Promise<string> {
    const user = await this.users.findOne({ where: { id: userId, tenantId } });
    return user?.fullName?.trim() || user?.username || "Manager";
  }

  private async cashierCash(
    tenantId: string,
    from: string,
    to: string,
    startIso: string,
    endIso: string,
  ): Promise<CashierCashSaleRow[]> {
    const sales = await this.dataSource.query<
      { cashier_user_id: string; cashier_name: string; cash_sales: string }[]
    >(
      `select coalesce(s.posted_by::text, '') as cashier_user_id,
              max(coalesce(nullif(s.posted_by_name, ''), nullif(u.full_name, ''), 'Cashier')) as cashier_name,
              coalesce(sum(p.amount), 0) as cash_sales
       from sale_payments p
       join sales s on s.id = p.sale_id and s.tenant_id = p.tenant_id
       left join users u on u.id = s.posted_by and u.tenant_id = s.tenant_id
       where p.tenant_id = $1
         and p.method = 'CASH'
         and s.status = 'POSTED'
         and s.posted_at >= $2::timestamptz
         and s.posted_at < $3::timestamptz
       group by coalesce(s.posted_by::text, '')`,
      [tenantId, startIso, endIso],
    );
    const refunds = await this.dataSource.query<
      { cashier_user_id: string; cashier_name: string; cash_refunds: string }[]
    >(
      `select coalesce(s.posted_by::text, '') as cashier_user_id,
              max(coalesce(nullif(s.posted_by_name, ''), nullif(u.full_name, ''), 'Cashier')) as cashier_name,
              coalesce(sum(r.refund_total), 0) as cash_refunds
       from sale_returns r
       join sales s on s.id = r.sale_id and s.tenant_id = r.tenant_id
       left join users u on u.id = s.posted_by and u.tenant_id = s.tenant_id
       where r.tenant_id = $1
         and r.refund_method = 'CASH'
         and r.status in ('POSTED', 'COMPLETED')
         and r.return_date >= $2::date
         and r.return_date <= $3::date
       group by coalesce(s.posted_by::text, '')`,
      [tenantId, from, to],
    );
    const map = new Map<
      string,
      { name: string; cashSales: number; cashRefunds: number }
    >();
    const touch = (id: string, name: string) => {
      const current = map.get(id) ?? {
        name: name.trim() || "Cashier",
        cashSales: 0,
        cashRefunds: 0,
      };
      if (name.trim() && current.name === "Cashier") current.name = name.trim();
      map.set(id, current);
      return current;
    };
    for (const row of sales) {
      touch(row.cashier_user_id, row.cashier_name).cashSales = num(row.cash_sales);
    }
    for (const row of refunds) {
      touch(row.cashier_user_id, row.cashier_name).cashRefunds = num(
        row.cash_refunds,
      );
    }
    return [...map.entries()]
      .map(([cashierUserId, row]) => ({
        cashierUserId,
        cashierName: row.name,
        cashSales: roundMoney(row.cashSales),
        cashRefunds: roundMoney(row.cashRefunds),
        netCash: roundMoney(row.cashSales - row.cashRefunds),
      }))
      .sort((a, b) => b.netCash - a.netCash);
  }

  private async collections(
    tenantId: string,
    userId: string,
    seeAll: boolean,
    startIso: string,
    endIso: string,
  ): Promise<CashCollectionRow[]> {
    const rows = await this.dataSource.query<
      {
        id: string;
        created_at: Date;
        kind: string;
        withdrawal_total: string;
        manager_user_id: string;
        manager_name: string;
        cashier_user_id: string;
        cashier_name: string;
      }[]
    >(
      `select w.id,
              w.created_at,
              w.kind,
              w.withdrawal_total,
              w.withdrawn_by_user_id as manager_user_id,
              coalesce(nullif(mu.full_name, ''), nullif(mu.username, ''), 'Manager') as manager_name,
              coalesce(ts.user_id::text, '') as cashier_user_id,
              coalesce(nullif(cu.full_name, ''), nullif(cu.username, ''), nullif(ts.till_name, ''), 'Cashier') as cashier_name
       from till_withdrawals w
       left join till_sessions ts on ts.id = w.till_session_id
       left join users mu on mu.id = w.withdrawn_by_user_id and mu.tenant_id = w.tenant_id
       left join users cu on cu.id = ts.user_id and cu.tenant_id = w.tenant_id
       where w.tenant_id = $1
         and w.created_at >= $2::timestamptz
         and w.created_at < $3::timestamptz
         and ($4::boolean or w.withdrawn_by_user_id = $5)
       order by w.created_at desc`,
      [tenantId, startIso, endIso, seeAll, userId],
    );
    return rows.map((row) => ({
      id: row.id,
      at: new Date(row.created_at).toISOString(),
      managerUserId: row.manager_user_id,
      managerName: row.manager_name,
      cashierUserId: row.cashier_user_id,
      cashierName: row.cashier_name,
      kind: row.kind || "full",
      amount: roundMoney(num(row.withdrawal_total)),
    }));
  }

  private async expenseRows(
    tenantId: string,
    userId: string,
    seeAll: boolean,
    startIso: string,
    endIso: string,
  ): Promise<CashExpenseRow[]> {
    const rows = await this.dataSource.query<
      {
        id: string;
        occurred_at: Date;
        manager_user_id: string;
        manager_name: string;
        category: string;
        amount: string;
        note: string;
      }[]
    >(
      `select e.id,
              e.occurred_at,
              e.recorded_by_user_id as manager_user_id,
              coalesce(nullif(e.recorded_by_name, ''), nullif(u.full_name, ''), 'Manager') as manager_name,
              e.category,
              e.amount,
              e.note
       from cash_expenses e
       left join users u on u.id = e.recorded_by_user_id and u.tenant_id = e.tenant_id
       where e.tenant_id = $1
         and e.occurred_at >= $2::timestamptz
         and e.occurred_at < $3::timestamptz
         and ($4::boolean or e.recorded_by_user_id = $5)
       order by e.occurred_at desc`,
      [tenantId, startIso, endIso, seeAll, userId],
    );
    return rows.map((row) => {
      const category: CashExpenseCategory = isCashExpenseCategory(row.category)
        ? row.category
        : "Other";
      return {
        id: row.id,
        at: new Date(row.occurred_at).toISOString(),
        managerUserId: row.manager_user_id,
        managerName: row.manager_name,
        category,
        amount: roundMoney(num(row.amount)),
        note: row.note ?? "",
      };
    });
  }
}
