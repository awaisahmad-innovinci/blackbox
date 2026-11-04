/** Store calendar is Pakistan (UTC+5, no daylight saving). */
const BUSINESS_OFFSET = "+05:00";

export const CASH_EXPENSE_CATEGORIES = [
  "Rent",
  "Electricity",
  "Internet",
  "Other",
] as const;

export type CashExpenseCategory = (typeof CASH_EXPENSE_CATEGORIES)[number];

export function isCashExpenseCategory(
  value: string,
): value is CashExpenseCategory {
  return (CASH_EXPENSE_CATEGORIES as readonly string[]).includes(value);
}

export interface CashierCashSaleRow {
  cashierUserId: string;
  cashierName: string;
  cashSales: number;
  cashRefunds: number;
  netCash: number;
}

export interface CashCollectionRow {
  id: string;
  at: string;
  managerUserId: string;
  managerName: string;
  cashierUserId: string;
  cashierName: string;
  kind: string;
  amount: number;
}

export interface CashExpenseRow {
  id: string;
  at: string;
  managerUserId: string;
  managerName: string;
  category: CashExpenseCategory;
  amount: number;
  note: string;
}

export interface ManagerDrawerBalance {
  managerUserId: string;
  managerName: string;
  collected: number;
  expenses: number;
  balance: number;
}

export interface CashFlowReport {
  periodFrom: string;
  periodTo: string;
  cashierCashSales: CashierCashSaleRow[];
  collections: CashCollectionRow[];
  expenses: CashExpenseRow[];
  drawers: ManagerDrawerBalance[];
}

export interface RecordCashExpenseRequest {
  category: CashExpenseCategory;
  amount: number;
  note?: string;
}

export interface BusinessPeriodBounds {
  from: string;
  to: string;
  startIso: string;
  endIso: string;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Inclusive calendar days in the store timezone, as a half-open instant range. */
export function businessPeriodBounds(
  from: string,
  to: string,
): BusinessPeriodBounds {
  if (!DAY.test(from) || !DAY.test(to) || from > to) {
    throw new Error("Invalid date range");
  }
  const start = new Date(`${from}T00:00:00${BUSINESS_OFFSET}`);
  const endDay = new Date(`${to}T00:00:00${BUSINESS_OFFSET}`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(endDay.getTime())) {
    throw new Error("Invalid date range");
  }
  const end = new Date(endDay.getTime() + 24 * 60 * 60 * 1000);
  return {
    from,
    to,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}
