import {
  DEMO_STORE_TENANT_ID,
  businessPeriodBounds,
  expenseExceedsDrawer,
  expenseOverDrawerMessage,
  isCashExpenseCategory,
  formatMoney,
  managerDrawerBalance,
  roundMoney4,
  type CashCollectionRow,
  type CashExpenseCategory,
  type CashExpenseRow,
  type CashFlowReport,
  type CashierCashSaleRow,
  type ManagerDrawerBalance,
} from "@blackbox/shared";
import { getLocalDb } from "./index";

function roundMoney(value: number): number {
  return roundMoney4(Number.isFinite(value) ? value : 0);
}

function num(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function assertCashExpenseWithinDrawer(input: {
  id: string;
  recordedByUserId: string;
  amount: number;
}): void {
  const db = getLocalDb();
  const tenantId = DEMO_STORE_TENANT_ID;
  const row = db
    .prepare(
      `select
         coalesce((
           select sum(amount) from manager_drawer_openings
           where tenant_id = @tenantId and manager_user_id = @userId
         ), 0) as opening_float,
         coalesce((
           select sum(withdrawal_total) from till_withdrawals
           where tenant_id = @tenantId and withdrawn_by_user_id = @userId
         ), 0) as collected,
         coalesce((
           select sum(amount) from cash_expenses
           where tenant_id = @tenantId
             and recorded_by_user_id = @userId
             and id != @id
         ), 0) as expenses,
         coalesce((
           select sum(opening_balance) from till_sessions
           where tenant_id = @tenantId and funded_by_user_id = @userId
         ), 0) as till_floats,
         coalesce((
           select sum(amount) from manager_drawer_submissions
           where tenant_id = @tenantId and manager_user_id = @userId
         ), 0) as submitted`,
    )
    .get({
      tenantId,
      userId: input.recordedByUserId,
      id: input.id,
    }) as {
    opening_float: number;
    collected: number;
    expenses: number;
    till_floats: number;
    submitted: number;
  };
  const available = roundMoney(
    num(row.opening_float) +
      num(row.collected) -
      num(row.expenses) -
      num(row.till_floats) -
      num(row.submitted),
  );
  if (expenseExceedsDrawer(input.amount, available)) {
    throw new Error(expenseOverDrawerMessage(available));
  }
}

export function getOwnerCashBalanceLocal(
  ownerUserId: string,
  exclude?: { expenseId?: string; openingId?: string },
): number {
  const db = getLocalDb();
  const row = db
    .prepare(
      `select
         coalesce((
           select sum(amount) from manager_drawer_submissions
           where tenant_id = @tenantId
         ), 0)
         + coalesce((
           select sum(amount) from owner_cash_entries
           where tenant_id = @tenantId
         ), 0)
         - coalesce((
           select sum(amount) from cash_expenses
           where tenant_id = @tenantId
             and recorded_by_user_id = @ownerUserId
             and id != @excludeExpenseId
         ), 0)
         - coalesce((
           select sum(amount) from manager_drawer_openings
           where tenant_id = @tenantId
             and id != @excludeOpeningId
         ), 0) as balance`,
    )
    .get({
      tenantId: DEMO_STORE_TENANT_ID,
      ownerUserId,
      excludeExpenseId: exclude?.expenseId ?? "",
      excludeOpeningId: exclude?.openingId ?? "",
    }) as { balance: number };
  return roundMoney(num(row.balance));
}

export function assertOwnerCashCovers(input: {
  ownerUserId: string;
  amount: number;
  excludeExpenseId?: string;
  excludeOpeningId?: string;
}): void {
  const available = getOwnerCashBalanceLocal(input.ownerUserId, {
    expenseId: input.excludeExpenseId,
    openingId: input.excludeOpeningId,
  });
  if (expenseExceedsDrawer(input.amount, available)) {
    throw new Error(expenseOverDrawerMessage(available));
  }
}

export function upsertOwnerCashEntryLocal(input: {
  id: string;
  recordedByUserId: string;
  recordedByName: string;
  amount: number;
  note: string;
  recordedAt: string;
  createdAt: string;
  updatedAt: string;
}): void {
  if (!(input.amount > 0)) {
    throw new Error("Enter an amount greater than zero");
  }
  const db = getLocalDb();
  const now = new Date().toISOString();
  db.prepare(
    `
    insert into owner_cash_entries (
      id, tenant_id, recorded_by_user_id, recorded_by_name, amount, note,
      recorded_at, created_at, updated_at, sync_status
    ) values (
      @id, @tenantId, @recordedByUserId, @recordedByName, @amount, @note,
      @recordedAt, @createdAt, @updatedAt, 'synced'
    )
    on conflict(id) do update set
      recorded_by_user_id = excluded.recorded_by_user_id,
      recorded_by_name = excluded.recorded_by_name,
      amount = excluded.amount,
      note = excluded.note,
      recorded_at = excluded.recorded_at,
      updated_at = excluded.updated_at,
      sync_status = 'synced'
  `,
  ).run({
    id: input.id,
    tenantId: DEMO_STORE_TENANT_ID,
    recordedByUserId: input.recordedByUserId,
    recordedByName: input.recordedByName,
    amount: input.amount,
    note: input.note,
    recordedAt: input.recordedAt || now,
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
  });
}

export function upsertCashExpenseLocal(input: {
  id: string;
  recordedByUserId: string;
  recordedByName: string;
  category: string;
  amount: number;
  note: string;
  occurredAt: string;
  createdAt: string;
  updatedAt: string;
}): void {
  const db = getLocalDb();
  const now = new Date().toISOString();
  db.prepare(
    `
    insert into cash_expenses (
      id, tenant_id, recorded_by_user_id, recorded_by_name, category, amount,
      note, occurred_at, created_at, updated_at, sync_status
    ) values (
      @id, @tenantId, @recordedByUserId, @recordedByName, @category, @amount,
      @note, @occurredAt, @createdAt, @updatedAt, 'synced'
    )
    on conflict(id) do update set
      recorded_by_user_id = excluded.recorded_by_user_id,
      recorded_by_name = excluded.recorded_by_name,
      category = excluded.category,
      amount = excluded.amount,
      note = excluded.note,
      occurred_at = excluded.occurred_at,
      updated_at = excluded.updated_at,
      sync_status = 'synced'
  `,
  ).run({
    id: input.id,
    tenantId: DEMO_STORE_TENANT_ID,
    recordedByUserId: input.recordedByUserId,
    recordedByName: input.recordedByName,
    category: input.category,
    amount: input.amount,
    note: input.note,
    occurredAt: input.occurredAt || now,
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
  });
}

type DrawerAcc = {
  name: string;
  namedAt: string;
  openingFloat: number;
  collected: number;
  expenses: number;
  tillFloats: number;
  submitted: number;
};

const cashierExcludedWhenSeeAll = `
  and (
    @seeAll = 0
    or not exists (
      select 1 from till_sessions ts
      where ts.tenant_id = @tenantId
        and ts.user_id = manager_user_id
    )
  )
`;

export function listDrawerBalancesLocal(input: {
  userId: string;
  managerName: string;
  seeAll: boolean;
}): ManagerDrawerBalance[] {
  const db = getLocalDb();
  const tenantId = DEMO_STORE_TENANT_ID;
  const collected = db
    .prepare(
      `select withdrawn_by_user_id as manager_user_id,
              (
                select w2.withdrawn_by_name
                from till_withdrawals w2
                where w2.tenant_id = @tenantId
                  and w2.withdrawn_by_user_id = till_withdrawals.withdrawn_by_user_id
                  and trim(coalesce(w2.withdrawn_by_name, '')) != ''
                order by w2.created_at desc
                limit 1
              ) as manager_name,
              max(created_at) as named_at,
              coalesce(sum(withdrawal_total), 0) as collected
       from till_withdrawals
       where tenant_id = @tenantId
         and (@seeAll = 1 or withdrawn_by_user_id = @userId)
         ${cashierExcludedWhenSeeAll.replaceAll("manager_user_id", "withdrawn_by_user_id")}
       group by withdrawn_by_user_id`,
    )
    .all({
      tenantId,
      userId: input.userId,
      seeAll: input.seeAll ? 1 : 0,
    }) as {
    manager_user_id: string;
    manager_name: string;
    named_at: string;
    collected: number;
  }[];

  const expenses = db
    .prepare(
      `select recorded_by_user_id as manager_user_id,
              (
                select e2.recorded_by_name
                from cash_expenses e2
                where e2.tenant_id = @tenantId
                  and e2.recorded_by_user_id = cash_expenses.recorded_by_user_id
                  and trim(coalesce(e2.recorded_by_name, '')) != ''
                order by e2.created_at desc
                limit 1
              ) as manager_name,
              max(created_at) as named_at,
              coalesce(sum(amount), 0) as expenses
       from cash_expenses
       where tenant_id = @tenantId
         and (@seeAll = 1 or recorded_by_user_id = @userId)
         and (@seeAll = 0 or recorded_by_user_id <> @userId)
         ${cashierExcludedWhenSeeAll.replaceAll("manager_user_id", "recorded_by_user_id")}
       group by recorded_by_user_id`,
    )
    .all({
      tenantId,
      userId: input.userId,
      seeAll: input.seeAll ? 1 : 0,
    }) as {
    manager_user_id: string;
    manager_name: string;
    named_at: string;
    expenses: number;
  }[];

  const openings = db
    .prepare(
      `select manager_user_id,
              (
                select o2.manager_name
                from manager_drawer_openings o2
                where o2.tenant_id = @tenantId
                  and o2.manager_user_id = manager_drawer_openings.manager_user_id
                  and trim(coalesce(o2.manager_name, '')) != ''
                order by o2.opened_at desc
                limit 1
              ) as manager_name,
              max(opened_at) as named_at,
              coalesce(sum(amount), 0) as opening_float
       from manager_drawer_openings
       where tenant_id = @tenantId
         and (@seeAll = 1 or manager_user_id = @userId)
         ${cashierExcludedWhenSeeAll.replaceAll("manager_user_id", "manager_user_id")}
       group by manager_user_id`,
    )
    .all({
      tenantId,
      userId: input.userId,
      seeAll: input.seeAll ? 1 : 0,
    }) as {
    manager_user_id: string;
    manager_name: string;
    named_at: string;
    opening_float: number;
  }[];

  const tillFloats = db
    .prepare(
      `select funded_by_user_id as manager_user_id,
              '' as manager_name,
              max(opened_at) as named_at,
              coalesce(sum(opening_balance), 0) as till_floats
       from till_sessions
       where tenant_id = @tenantId
         and funded_by_user_id is not null
         and (@seeAll = 1 or funded_by_user_id = @userId)
         ${cashierExcludedWhenSeeAll.replaceAll("manager_user_id", "funded_by_user_id")}
       group by funded_by_user_id`,
    )
    .all({
      tenantId,
      userId: input.userId,
      seeAll: input.seeAll ? 1 : 0,
    }) as {
    manager_user_id: string;
    manager_name: string;
    named_at: string;
    till_floats: number;
  }[];

  const submissions = db
    .prepare(
      `select manager_user_id,
              (
                select s2.manager_name
                from manager_drawer_submissions s2
                where s2.tenant_id = @tenantId
                  and s2.manager_user_id = manager_drawer_submissions.manager_user_id
                  and trim(coalesce(s2.manager_name, '')) != ''
                order by s2.submitted_at desc
                limit 1
              ) as manager_name,
              max(submitted_at) as named_at,
              coalesce(sum(amount), 0) as submitted
       from manager_drawer_submissions
       where tenant_id = @tenantId
         and (@seeAll = 1 or manager_user_id = @userId)
         ${cashierExcludedWhenSeeAll.replaceAll("manager_user_id", "manager_user_id")}
       group by manager_user_id`,
    )
    .all({
      tenantId,
      userId: input.userId,
      seeAll: input.seeAll ? 1 : 0,
    }) as {
    manager_user_id: string;
    manager_name: string;
    named_at: string;
    submitted: number;
  }[];

  return mergeDrawers(collected, expenses, openings, tillFloats, submissions, input);
}

function mergeDrawers(
  collected: {
    manager_user_id: string;
    manager_name: string;
    named_at?: string;
    collected: number;
  }[],
  expenses: {
    manager_user_id: string;
    manager_name: string;
    named_at?: string;
    expenses: number;
  }[],
  openings: {
    manager_user_id: string;
    manager_name: string;
    named_at?: string;
    opening_float: number;
  }[],
  tillFloats: {
    manager_user_id: string;
    manager_name: string;
    named_at?: string;
    till_floats: number;
  }[],
  submissions: {
    manager_user_id: string;
    manager_name: string;
    named_at?: string;
    submitted: number;
  }[],
  input: { userId: string; managerName: string; seeAll: boolean },
): ManagerDrawerBalance[] {
  const map = new Map<string, DrawerAcc>();
  const touch = (id: string, name: string, namedAt = ""): DrawerAcc => {
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
      input.seeAll && trimmed && namedAt && namedAt >= current.namedAt;
    if (trimmed && (current.name === "Manager" || laterName)) {
      current.name = trimmed;
      if (namedAt) current.namedAt = namedAt;
    }
    map.set(id, current);
    return current;
  };
  for (const row of collected) {
    touch(row.manager_user_id, row.manager_name ?? "", row.named_at ?? "").collected =
      num(row.collected);
  }
  for (const row of expenses) {
    touch(row.manager_user_id, row.manager_name ?? "", row.named_at ?? "").expenses =
      num(row.expenses);
  }
  for (const row of openings) {
    touch(
      row.manager_user_id,
      row.manager_name ?? "",
      row.named_at ?? "",
    ).openingFloat = num(row.opening_float);
  }
  for (const row of tillFloats) {
    touch(row.manager_user_id, row.manager_name ?? "", row.named_at ?? "").tillFloats =
      num(row.till_floats);
  }
  for (const row of submissions) {
    touch(row.manager_user_id, row.manager_name ?? "", row.named_at ?? "").submitted =
      num(row.submitted);
  }
  if (!input.seeAll && input.userId && !map.has(input.userId)) {
    map.set(input.userId, {
      name: input.managerName.trim() || "Manager",
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

export function getManagerDrawerBalanceLocal(
  userId: string,
  managerName = "",
): number {
  return (
    listDrawerBalancesLocal({ userId, managerName, seeAll: false }).find(
      (row) => row.managerUserId === userId,
    )?.balance ?? 0
  );
}

export function upsertManagerDrawerOpeningLocal(input: {
  id: string;
  managerUserId: string;
  managerName: string;
  amount: number;
  openedByUserId: string;
  openedByName: string;
  openedAt: string;
  createdAt: string;
  updatedAt: string;
}): void {
  const db = getLocalDb();
  const now = new Date().toISOString();
  db.prepare(
    `
    insert into manager_drawer_openings (
      id, tenant_id, manager_user_id, manager_name, amount,
      opened_by_user_id, opened_by_name, opened_at, created_at, updated_at, sync_status
    ) values (
      @id, @tenantId, @managerUserId, @managerName, @amount,
      @openedByUserId, @openedByName, @openedAt, @createdAt, @updatedAt, 'synced'
    )
    on conflict(id) do update set
      manager_user_id = excluded.manager_user_id,
      manager_name = excluded.manager_name,
      amount = excluded.amount,
      opened_by_user_id = excluded.opened_by_user_id,
      opened_by_name = excluded.opened_by_name,
      opened_at = excluded.opened_at,
      updated_at = excluded.updated_at,
      sync_status = 'synced'
  `,
  ).run({
    id: input.id,
    tenantId: DEMO_STORE_TENANT_ID,
    managerUserId: input.managerUserId,
    managerName: input.managerName,
    amount: input.amount,
    openedByUserId: input.openedByUserId,
    openedByName: input.openedByName,
    openedAt: input.openedAt || now,
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
  });
}

export function assertDrawerSubmissionLocal(input: {
  id: string;
  managerUserId: string;
  amount: number;
}): void {
  const db = getLocalDb();
  const tenantId = DEMO_STORE_TENANT_ID;
  const row = db
    .prepare(
      `select
         coalesce((
           select sum(amount) from manager_drawer_openings
           where tenant_id = @tenantId and manager_user_id = @userId
         ), 0) as opening_float,
         coalesce((
           select sum(withdrawal_total) from till_withdrawals
           where tenant_id = @tenantId and withdrawn_by_user_id = @userId
         ), 0) as collected,
         coalesce((
           select sum(amount) from cash_expenses
           where tenant_id = @tenantId and recorded_by_user_id = @userId
         ), 0) as expenses,
         coalesce((
           select sum(opening_balance) from till_sessions
           where tenant_id = @tenantId and funded_by_user_id = @userId
         ), 0) as till_floats,
         coalesce((
           select sum(amount) from manager_drawer_submissions
           where tenant_id = @tenantId
             and manager_user_id = @userId
             and id != @id
         ), 0) as submitted`,
    )
    .get({
      tenantId,
      userId: input.managerUserId,
      id: input.id,
    }) as {
    opening_float: number;
    collected: number;
    expenses: number;
    till_floats: number;
    submitted: number;
  };
  const available = roundMoney(
    num(row.opening_float) +
      num(row.collected) -
      num(row.expenses) -
      num(row.till_floats) -
      num(row.submitted),
  );
  if (!(input.amount > 0) || expenseExceedsDrawer(input.amount, available)) {
    throw new Error(
      available > 0
        ? `Submit no more than the drawer balance of Rs ${formatMoney(available)}`
        : "There is no cash to submit",
    );
  }
}

export function upsertManagerDrawerSubmissionLocal(input: {
  id: string;
  managerUserId: string;
  managerName: string;
  amount: number;
  submittedAt: string;
  createdAt: string;
  updatedAt: string;
}): void {
  const db = getLocalDb();
  const now = new Date().toISOString();
  db.prepare(
    `
    insert into manager_drawer_submissions (
      id, tenant_id, manager_user_id, manager_name, amount,
      submitted_at, created_at, updated_at, sync_status
    ) values (
      @id, @tenantId, @managerUserId, @managerName, @amount,
      @submittedAt, @createdAt, @updatedAt, 'synced'
    )
    on conflict(id) do update set
      manager_user_id = excluded.manager_user_id,
      manager_name = excluded.manager_name,
      amount = excluded.amount,
      submitted_at = excluded.submitted_at,
      updated_at = excluded.updated_at,
      sync_status = 'synced'
  `,
  ).run({
    id: input.id,
    tenantId: DEMO_STORE_TENANT_ID,
    managerUserId: input.managerUserId,
    managerName: input.managerName,
    amount: input.amount,
    submittedAt: input.submittedAt || now,
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
  });
}

export function listDrawerSubmissionsTodayLocal(): {
  managerUserId: string;
  managerName: string;
  amount: number;
}[] {
  const db = getLocalDb();
  const rows = db
    .prepare(
      `select manager_user_id as managerUserId,
              max(manager_name) as managerName,
              coalesce(sum(amount), 0) as amount
       from manager_drawer_submissions
       where tenant_id = @tenantId
         and date(replace(substr(submitted_at, 1, 19), 'T', ' '), 'localtime')
             = date('now', 'localtime')
       group by manager_user_id
       order by managerName`,
    )
    .all({ tenantId: DEMO_STORE_TENANT_ID }) as {
    managerUserId: string;
    managerName: string;
    amount: number;
  }[];
  return rows.map((row) => ({
    managerUserId: row.managerUserId,
    managerName: row.managerName?.trim() || "Manager",
    amount: roundMoney(Number(row.amount)),
  }));
}

export function getCashFlowLocal(input: {
  userId: string;
  managerName: string;
  seeAll: boolean;
  from: string;
  to: string;
}): CashFlowReport {
  const bounds = businessPeriodBounds(input.from, input.to);
  const db = getLocalDb();
  const tenantId = DEMO_STORE_TENANT_ID;
  const seeAll = input.seeAll ? 1 : 0;

  const sales = db
    .prepare(
      `select coalesce(s.posted_by, '') as cashier_user_id,
              max(coalesce(nullif(s.posted_by_name, ''), 'Cashier')) as cashier_name,
              coalesce(sum(p.amount), 0) as cash_sales
       from sale_payments p
       join sales s on s.id = p.sale_id and s.tenant_id = p.tenant_id
       where p.tenant_id = @tenantId
         and p.method = 'CASH'
         and s.status = 'POSTED'
         and s.posted_at >= @startIso
         and s.posted_at < @endIso
       group by coalesce(s.posted_by, '')`,
    )
    .all({ tenantId, startIso: bounds.startIso, endIso: bounds.endIso }) as {
    cashier_user_id: string;
    cashier_name: string;
    cash_sales: number;
  }[];

  const refunds = db
    .prepare(
      `select coalesce(s.posted_by, '') as cashier_user_id,
              max(coalesce(nullif(s.posted_by_name, ''), 'Cashier')) as cashier_name,
              coalesce(sum(r.refund_total), 0) as cash_refunds
       from sale_returns r
       join sales s on s.id = r.sale_id and s.tenant_id = r.tenant_id
       where r.tenant_id = @tenantId
         and r.refund_method = 'CASH'
         and r.status in ('POSTED', 'COMPLETED')
         and r.return_date >= @from
         and r.return_date <= @to
       group by coalesce(s.posted_by, '')`,
    )
    .all({ tenantId, from: bounds.from, to: bounds.to }) as {
    cashier_user_id: string;
    cashier_name: string;
    cash_refunds: number;
  }[];

  const collectionRows = db
    .prepare(
      `select w.id,
              w.created_at,
              w.kind,
              w.withdrawal_total,
              w.withdrawn_by_user_id,
              w.withdrawn_by_name,
              coalesce(ts.user_id, '') as cashier_user_id,
              coalesce(nullif(ts.user_name, ''), 'Cashier') as cashier_name
       from till_withdrawals w
       left join till_sessions ts on ts.id = w.till_session_id
       where w.tenant_id = @tenantId
         and w.created_at >= @startIso
         and w.created_at < @endIso
         and (@seeAll = 1 or w.withdrawn_by_user_id = @userId)
       order by w.created_at desc`,
    )
    .all({
      tenantId,
      startIso: bounds.startIso,
      endIso: bounds.endIso,
      seeAll,
      userId: input.userId,
    }) as {
    id: string;
    created_at: string;
    kind: string;
    withdrawal_total: number;
    withdrawn_by_user_id: string;
    withdrawn_by_name: string;
    cashier_user_id: string;
    cashier_name: string;
  }[];

  const expenseRows = db
    .prepare(
      `select id, occurred_at, recorded_by_user_id, recorded_by_name,
              category, amount, note
       from cash_expenses
       where tenant_id = @tenantId
         and occurred_at >= @startIso
         and occurred_at < @endIso
         and (@seeAll = 1 or recorded_by_user_id = @userId)
       order by occurred_at desc`,
    )
    .all({
      tenantId,
      startIso: bounds.startIso,
      endIso: bounds.endIso,
      seeAll,
      userId: input.userId,
    }) as {
    id: string;
    occurred_at: string;
    recorded_by_user_id: string;
    recorded_by_name: string;
    category: string;
    amount: number;
    note: string;
  }[];

  return {
    periodFrom: bounds.from,
    periodTo: bounds.to,
    cashierCashSales: mergeCashierCash(sales, refunds),
    collections: collectionRows.map(
      (row): CashCollectionRow => ({
        id: row.id,
        at: row.created_at,
        managerUserId: row.withdrawn_by_user_id,
        managerName: row.withdrawn_by_name?.trim() || "Manager",
        cashierUserId: row.cashier_user_id,
        cashierName: row.cashier_name?.trim() || "Cashier",
        kind: row.kind || "full",
        amount: roundMoney(num(row.withdrawal_total)),
      }),
    ),
    expenses: expenseRows.map((row): CashExpenseRow => {
      const category: CashExpenseCategory = isCashExpenseCategory(row.category)
        ? row.category
        : "Other";
      return {
        id: row.id,
        at: row.occurred_at,
        managerUserId: row.recorded_by_user_id,
        managerName: row.recorded_by_name?.trim() || "Manager",
        category,
        amount: roundMoney(num(row.amount)),
        note: row.note ?? "",
      };
    }),
    drawers: listDrawerBalancesLocal(input),
    ownerCashBalance: input.seeAll
      ? getOwnerCashBalanceLocal(input.userId)
      : 0,
  };
}

function mergeCashierCash(
  sales: {
    cashier_user_id: string;
    cashier_name: string;
    cash_sales: number;
  }[],
  refunds: {
    cashier_user_id: string;
    cashier_name: string;
    cash_refunds: number;
  }[],
): CashierCashSaleRow[] {
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
