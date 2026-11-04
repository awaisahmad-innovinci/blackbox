import {
  DEMO_STORE_TENANT_ID,
  businessPeriodBounds,
  isCashExpenseCategory,
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

type DrawerAcc = { name: string; collected: number; expenses: number };

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
              max(withdrawn_by_name) as manager_name,
              coalesce(sum(withdrawal_total), 0) as collected
       from till_withdrawals
       where tenant_id = @tenantId
         and (@seeAll = 1 or withdrawn_by_user_id = @userId)
       group by withdrawn_by_user_id`,
    )
    .all({
      tenantId,
      userId: input.userId,
      seeAll: input.seeAll ? 1 : 0,
    }) as {
    manager_user_id: string;
    manager_name: string;
    collected: number;
  }[];

  const expenses = db
    .prepare(
      `select recorded_by_user_id as manager_user_id,
              max(recorded_by_name) as manager_name,
              coalesce(sum(amount), 0) as expenses
       from cash_expenses
       where tenant_id = @tenantId
         and (@seeAll = 1 or recorded_by_user_id = @userId)
       group by recorded_by_user_id`,
    )
    .all({
      tenantId,
      userId: input.userId,
      seeAll: input.seeAll ? 1 : 0,
    }) as {
    manager_user_id: string;
    manager_name: string;
    expenses: number;
  }[];

  return mergeDrawers(collected, expenses, input);
}

function mergeDrawers(
  collected: {
    manager_user_id: string;
    manager_name: string;
    collected: number;
  }[],
  expenses: {
    manager_user_id: string;
    manager_name: string;
    expenses: number;
  }[],
  input: { userId: string; managerName: string; seeAll: boolean },
): ManagerDrawerBalance[] {
  const map = new Map<string, DrawerAcc>();
  const touch = (id: string, name: string): DrawerAcc => {
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
    touch(row.manager_user_id, row.manager_name ?? "").collected = num(
      row.collected,
    );
  }
  for (const row of expenses) {
    touch(row.manager_user_id, row.manager_name ?? "").expenses = num(
      row.expenses,
    );
  }
  if (!input.seeAll && input.userId && !map.has(input.userId)) {
    map.set(input.userId, {
      name: input.managerName.trim() || "Manager",
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
