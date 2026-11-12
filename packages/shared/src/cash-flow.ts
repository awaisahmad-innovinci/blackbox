import { formatMoney, roundMoney4 } from "./inventory";

/** Store calendar is Pakistan (UTC+5, no daylight saving). */
const BUSINESS_OFFSET = "+05:00";

export const CASH_EXPENSE_CATEGORIES = [
  "Rent",
  "Electricity",
  "Internet",
  "Other",
  "Bank deposit",
] as const;

export type CashExpenseCategory = (typeof CASH_EXPENSE_CATEGORIES)[number];

export function isCashExpenseCategory(
  value: string,
): value is CashExpenseCategory {
  return (CASH_EXPENSE_CATEGORIES as readonly string[]).includes(value);
}

/** True when a new or updated expense would take the drawer below zero. */
export function expenseExceedsDrawer(amount: number, available: number): boolean {
  return roundMoney4(amount) > roundMoney4(available);
}

export function expenseOverDrawerMessage(available: number): string {
  const shown = roundMoney4(Math.max(0, available));
  return `Expense cannot be more than the drawer balance of Rs ${formatMoney(shown)}`;
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
  openingFloat: number;
  collected: number;
  expenses: number;
  tillFloats: number;
  submitted: number;
  balance: number;
}

export type DrawerPerson = {
  id: string;
  fullName: string;
  username: string;
};

export interface RecordManagerDrawerOpeningRequest {
  managerUserId: string;
  amount: number;
}

export function managerDrawerBalance(parts: {
  openingFloat: number;
  collected: number;
  expenses: number;
  tillFloats: number;
  submitted: number;
}): number {
  return roundMoney4(
    parts.openingFloat +
      parts.collected -
      parts.expenses -
      parts.tillFloats -
      parts.submitted,
  );
}

export function tillOpeningExceedsDrawer(
  opening: number,
  available: number,
): boolean {
  return roundMoney4(opening) > roundMoney4(available);
}

export function tillOpeningExceedsDrawerMessage(available: number): string {
  const shown = formatMoney(Math.max(0, roundMoney4(available)));
  return `Amount exceeds the manager drawer balance of Rs ${shown}`;
}

export interface CashFlowReport {
  periodFrom: string;
  periodTo: string;
  cashierCashSales: CashierCashSaleRow[];
  collections: CashCollectionRow[];
  expenses: CashExpenseRow[];
  drawers: ManagerDrawerBalance[];
  /** Running owner drawer. Zero unless the viewer is the owner. Not limited to the report dates. */
  ownerCashBalance: number;
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
