import {
  BadRequestException,
  Injectable,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import {
  businessPeriodBounds,
  isCashExpenseCategory,
  roundMoney4,
  type CashCollectionRow,
  type CashExpenseCategory,
  type CashExpenseRow,
  type CashFlowReport,
  type CashierCashSaleRow,
  type ManagerDrawerBalance,
  type RecordCashExpenseRequest,
} from "@blackbox/shared";
import { DataSource, Repository } from "typeorm";
import type { TenantContext } from "../common/tenant-context";
import { CashExpense, User } from "../db/entities";

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
    @InjectRepository(User)
    private readonly users: Repository<User>,
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
    return {
      id: saved.id,
      at: saved.occurredAt.toISOString(),
      managerUserId: saved.recordedByUserId,
      managerName: saved.recordedByName || managerName,
      category: body.category,
      amount: roundMoney(num(saved.amount)),
      note: saved.note,
    };
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
    const collected = await this.dataSource.query<
      { manager_user_id: string; manager_name: string; collected: string }[]
    >(
      `select w.withdrawn_by_user_id as manager_user_id,
              max(coalesce(nullif(u.full_name, ''), nullif(u.username, ''), 'Manager')) as manager_name,
              coalesce(sum(w.withdrawal_total), 0) as collected
       from till_withdrawals w
       left join users u on u.id = w.withdrawn_by_user_id and u.tenant_id = w.tenant_id
       where w.tenant_id = $1
         and ($2::boolean or w.withdrawn_by_user_id = $3)
       group by w.withdrawn_by_user_id`,
      [tenantId, seeAll, userId],
    );
    const spent = await this.dataSource.query<
      { manager_user_id: string; manager_name: string; expenses: string }[]
    >(
      `select e.recorded_by_user_id as manager_user_id,
              max(coalesce(nullif(e.recorded_by_name, ''), nullif(u.full_name, ''), 'Manager')) as manager_name,
              coalesce(sum(e.amount), 0) as expenses
       from cash_expenses e
       left join users u on u.id = e.recorded_by_user_id and u.tenant_id = e.tenant_id
       where e.tenant_id = $1
         and ($2::boolean or e.recorded_by_user_id = $3)
       group by e.recorded_by_user_id`,
      [tenantId, seeAll, userId],
    );
    const map = new Map<
      string,
      { name: string; collected: number; expenses: number }
    >();
    const touch = (id: string, name: string) => {
      const current = map.get(id) ?? {
        name: name.trim() || "Manager",
        collected: 0,
        expenses: 0,
      };
      if (name.trim() && current.name === "Manager") current.name = name.trim();
      map.set(id, current);
      return current;
    };
    for (const row of collected) {
      touch(row.manager_user_id, row.manager_name).collected = num(row.collected);
    }
    for (const row of spent) {
      touch(row.manager_user_id, row.manager_name).expenses = num(row.expenses);
    }
    if (!seeAll && userId && !map.has(userId)) {
      map.set(userId, {
        name: signedInName,
        collected: 0,
        expenses: 0,
      });
    }
    return [...map.entries()]
      .map(([managerUserId, row]) => ({
        managerUserId,
        managerName: row.name,
        collected: roundMoney(row.collected),
        expenses: roundMoney(row.expenses),
        balance: roundMoney(row.collected - row.expenses),
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
