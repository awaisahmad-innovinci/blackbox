export const TILL_NOTE_DENOMINATIONS = [10, 20, 50, 100, 500, 1000, 5000] as const;

export type TillNoteDenomination = (typeof TILL_NOTE_DENOMINATIONS)[number];

export const TILL_MAX_EXTRA_CASH = 100_000;

export const TILL_WARNING_EXTRA_CASH = 90_000;

/** Max cash left in till when cashier closes voluntarily (must withdraw above this). */
export const TILL_MAX_CASH_BALANCE_TO_CLOSE = 1;

export const TILL_STATUSES = [
  "PENDING_APPROVAL",
  "OPEN",
  "CLOSED_LIMIT",
  "CLOSED",
] as const;

export type TillStatus = (typeof TILL_STATUSES)[number];

/** Till session still active for a cashier (blocks logout until resolved). */
export const TILL_ACTIVE_SESSION_STATUSES = [
  "PENDING_APPROVAL",
  "OPEN",
  "CLOSED_LIMIT",
] as const satisfies readonly TillStatus[];

/** Cashier voluntary end-of-shift close (manager must reopen). */
export const TILL_CLOSE_REASON_CASHIER_CLOSED = "CASHIER_CLOSED";

export type TillNoteCounts = {
  note10: number;
  note20: number;
  note50: number;
  note100: number;
  note500: number;
  note1000: number;
  note5000: number;
};

export type TillSessionDetail = TillNoteCounts & {
  id: string;
  userId: string;
  userName: string;
  tillName: string;
  status: TillStatus;
  openingTotal: number;
  openingBalance: number;
  currentCashBalance: number;
  maxCashLimit: number;
  openedAt: string | null;
  closedAt: string | null;
  approvedByUserId: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  reopenedByUserId: string | null;
  reopenedByName: string | null;
  closeReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TillListItem = {
  id: string;
  userId: string;
  userName: string;
  tillName: string;
  status: TillStatus;
  openingBalance: number;
  currentCashBalance: number;
  maxCashLimit: number;
  openedAt: string | null;
  closedAt: string | null;
};

export type OpenTillRequest = TillNoteCounts & {
  openingBalance: number;
  /** Set when supervisor Authy verified client-side and tenant requires approval */
  supervisorApproved?: boolean;
  supervisorUserId?: string;
};

export type WithdrawTillRequest = TillNoteCounts & {
  supervisorUserId?: string;
};

export type ReopenTillRequest = TillNoteCounts & {
  openingBalance: number;
  supervisorUserId?: string;
};

export type CollectTillCashByAmountRequest = {
  amount: number;
  supervisorUserId?: string;
};

export function computeTillDenominationTotal(notes: TillNoteCounts): number {
  return (
    notes.note10 * 10 +
    notes.note20 * 20 +
    notes.note50 * 50 +
    notes.note100 * 100 +
    notes.note500 * 500 +
    notes.note1000 * 1000 +
    notes.note5000 * 5000
  );
}

export function tillMaxLimit(openingBalance: number): number {
  return openingBalance + TILL_MAX_EXTRA_CASH;
}

export function tillWarningThreshold(openingBalance: number): number {
  return openingBalance + TILL_WARNING_EXTRA_CASH;
}

export function isTillNearLimit(session: {
  status: TillStatus;
  openingBalance: number;
  currentCashBalance: number;
  maxCashLimit: number;
}): boolean {
  if (session.status !== "OPEN") return false;
  if (session.currentCashBalance >= session.maxCashLimit) return false;
  return session.currentCashBalance >= tillWarningThreshold(session.openingBalance);
}

export function tillRemainingHeadroom(session: {
  currentCashBalance: number;
  maxCashLimit: number;
}): number {
  return Math.max(0, session.maxCashLimit - session.currentCashBalance);
}

export function emptyTillNotes(): TillNoteCounts {
  return {
    note10: 0,
    note20: 0,
    note50: 0,
    note100: 0,
    note500: 0,
    note1000: 0,
    note5000: 0,
  };
}

export function validateTillOpeningBalance(
  notes: TillNoteCounts,
  openingBalance: number,
): string | null {
  const total = computeTillDenominationTotal(notes);
  if (total <= 0) return "Enter at least one note count.";
  if (Math.abs(total - openingBalance) > 0.0001) {
    return "Opening balance must match the denomination total.";
  }
  return null;
}

export function validateTillOpeningBalanceAmount(
  openingBalance: number,
): string | null {
  if (!Number.isFinite(openingBalance) || openingBalance <= 0) {
    return "Enter a valid opening balance.";
  }
  return null;
}

export function formatTillName(username: string): string {
  const trimmed = username.trim();
  if (!trimmed) return "till";
  return `${trimmed} till`;
}

export function validateTillCanCloseBalance(
  currentCashBalance: number,
): string | null {
  if (
    Number.isFinite(currentCashBalance) &&
    currentCashBalance > TILL_MAX_CASH_BALANCE_TO_CLOSE
  ) {
    return "Withdraw your cash first. Till balance must be Rs 1 or less before closing.";
  }
  return null;
}

export function tillSessionBlocksLogout(
  session: TillSessionDetail | null,
): boolean {
  if (!session) return false;
  return (TILL_ACTIVE_SESSION_STATUSES as readonly TillStatus[]).includes(
    session.status,
  );
}

export function tillLogoutBlockMessage(session: TillSessionDetail): string {
  switch (session.status) {
    case "OPEN":
      return "Close your till before signing out. Withdraw cash if needed, then use Close till.";
    case "PENDING_APPROVAL":
      return "Your till is pending manager approval. Contact a manager before signing out.";
    case "CLOSED_LIMIT":
      return "Your till hit the cash limit. Contact a manager before signing out.";
    default:
      return "Resolve your till session before signing out.";
  }
}
