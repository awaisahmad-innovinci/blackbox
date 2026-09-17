import type {
  OpenTillRequest,
  ReopenTillRequest,
  TillListItem,
  TillNoteCounts,
  TillSessionDetail,
  TillStatus,
  WithdrawTillRequest,
} from "@blackbox/shared";
import {
  computeTillDenominationTotal,
  emptyTillNotes,
  TILL_CLOSE_REASON_CASHIER_CLOSED,
  tillMaxLimit,
  validateTillOpeningBalance,
  validateTillOpeningBalanceAmount,
} from "@blackbox/shared";
import { randomUUID } from "node:crypto";
import { getLocalDb } from "./index";
import { DEMO_STORE_TENANT_ID } from "@blackbox/shared";

const ACTIVE_STATUSES: TillStatus[] = [
  "PENDING_APPROVAL",
  "OPEN",
  "CLOSED_LIMIT",
];

type TillRow = {
  id: string;
  tenant_id: string;
  user_id: string;
  user_name: string;
  status: TillStatus;
  note_10: number;
  note_20: number;
  note_50: number;
  note_100: number;
  note_500: number;
  note_1000: number;
  note_5000: number;
  opening_total: number;
  opening_balance: number;
  current_cash_balance: number;
  max_cash_limit: number;
  opened_at: string | null;
  closed_at: string | null;
  approved_by_user_id: string | null;
  approved_by_name: string | null;
  approved_at: string | null;
  reopened_by_user_id: string | null;
  reopened_by_name: string | null;
  close_reason: string | null;
  created_at: string;
  updated_at: string;
};

function notesFromRow(row: TillRow): TillNoteCounts {
  return {
    note10: row.note_10,
    note20: row.note_20,
    note50: row.note_50,
    note100: row.note_100,
    note500: row.note_500,
    note1000: row.note_1000,
    note5000: row.note_5000,
  };
}

function rowToDetail(row: TillRow): TillSessionDetail {
  return {
    ...notesFromRow(row),
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    status: row.status,
    openingTotal: row.opening_total,
    openingBalance: row.opening_balance,
    currentCashBalance: row.current_cash_balance,
    maxCashLimit: row.max_cash_limit,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    approvedByUserId: row.approved_by_user_id,
    approvedByName: row.approved_by_name,
    approvedAt: row.approved_at,
    reopenedByUserId: row.reopened_by_user_id,
    reopenedByName: row.reopened_by_name,
    closeReason: row.close_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToListItem(row: TillRow): TillListItem {
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    status: row.status,
    openingBalance: row.opening_balance,
    currentCashBalance: row.current_cash_balance,
    maxCashLimit: row.max_cash_limit,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
  };
}

function findActiveSession(userId: string): TillRow | undefined {
  const db = getLocalDb();
  return db
    .prepare(
      `
      select *
      from till_sessions
      where tenant_id = @tenantId
        and user_id = @userId
        and status in ('PENDING_APPROVAL', 'OPEN', 'CLOSED_LIMIT')
      order by opened_at desc, created_at desc
      limit 1
    `,
    )
    .get({ tenantId: DEMO_STORE_TENANT_ID, userId }) as TillRow | undefined;
}

function getSession(id: string): TillRow | undefined {
  const db = getLocalDb();
  return db
    .prepare(
      `select * from till_sessions where tenant_id = @tenantId and id = @id`,
    )
    .get({ tenantId: DEMO_STORE_TENANT_ID, id }) as TillRow | undefined;
}

export function getCurrentTillLocal(userId: string): TillSessionDetail | null {
  const row = findActiveSession(userId);
  return row ? rowToDetail(row) : null;
}

export function getLatestTillSessionLocal(
  userId: string,
): TillSessionDetail | null {
  const db = getLocalDb();
  const row = db
    .prepare(
      `
      select *
      from till_sessions
      where tenant_id = @tenantId and user_id = @userId
      order by created_at desc
      limit 1
    `,
    )
    .get({ tenantId: DEMO_STORE_TENANT_ID, userId }) as TillRow | undefined;
  return row ? rowToDetail(row) : null;
}

export function listTillsLocal(query: {
  status?: TillStatus;
  userId?: string;
} = {}): TillListItem[] {
  const db = getLocalDb();
  const where = [
    "tenant_id = @tenantId",
    query.status ? "status = @status" : "",
    query.userId ? "user_id = @userId" : "",
  ]
    .filter(Boolean)
    .join(" and ");

  const rows = db
    .prepare(
      `select * from till_sessions where ${where} order by opened_at desc, created_at desc`,
    )
    .all({
      tenantId: DEMO_STORE_TENANT_ID,
      status: query.status ?? "",
      userId: query.userId ?? "",
    }) as TillRow[];

  return rows.map(rowToListItem);
}

export function openTillLocal(input: {
  userId: string;
  userName: string;
  body: OpenTillRequest;
  requireApproval: boolean;
}): TillSessionDetail {
  const validationError = validateTillOpeningBalanceAmount(
    input.body.openingBalance,
  );
  if (validationError) throw new Error(validationError);

  if (findActiveSession(input.userId)) {
    throw new Error("You already have an active till session");
  }

  const db = getLocalDb();
  const latest = db
    .prepare(
      `
      select status from till_sessions
      where tenant_id = @tenantId and user_id = @userId
      order by created_at desc
      limit 1
    `,
    )
    .get({ tenantId: DEMO_STORE_TENANT_ID, userId: input.userId }) as
    | { status: TillStatus }
    | undefined;
  if (latest?.status === "CLOSED") {
    throw new Error("Contact a manager to reopen your till");
  }

  const now = new Date().toISOString();
  const openingBalance = input.body.openingBalance;
  const openingTotal = openingBalance;
  const maxLimit = tillMaxLimit(openingBalance);
  const approvedNow =
    !input.requireApproval || input.body.supervisorApproved === true;
  const status: TillStatus = approvedNow ? "OPEN" : "PENDING_APPROVAL";
  const zeroNotes = emptyTillNotes();

  const row: TillRow = {
    id: randomUUID(),
    tenant_id: DEMO_STORE_TENANT_ID,
    user_id: input.userId,
    user_name: input.userName,
    status,
    note_10: zeroNotes.note10,
    note_20: zeroNotes.note20,
    note_50: zeroNotes.note50,
    note_100: zeroNotes.note100,
    note_500: zeroNotes.note500,
    note_1000: zeroNotes.note1000,
    note_5000: zeroNotes.note5000,
    opening_total: openingTotal,
    opening_balance: openingBalance,
    current_cash_balance: openingBalance,
    max_cash_limit: maxLimit,
    opened_at: now,
    closed_at: null,
    approved_by_user_id: approvedNow ? input.userId : null,
    approved_by_name: approvedNow ? input.userName : null,
    approved_at: approvedNow ? now : null,
    reopened_by_user_id: null,
    reopened_by_name: null,
    close_reason: null,
    created_at: now,
    updated_at: now,
  };

  db.prepare(
    `
    insert into till_sessions (
      id, tenant_id, user_id, user_name, status,
      note_10, note_20, note_50, note_100, note_500, note_1000, note_5000,
      opening_total, opening_balance, current_cash_balance, max_cash_limit,
      opened_at, closed_at, approved_by_user_id, approved_by_name, approved_at,
      reopened_by_user_id, reopened_by_name, close_reason, created_at, updated_at
    ) values (
      @id, @tenant_id, @user_id, @user_name, @status,
      @note_10, @note_20, @note_50, @note_100, @note_500, @note_1000, @note_5000,
      @opening_total, @opening_balance, @current_cash_balance, @max_cash_limit,
      @opened_at, @closed_at, @approved_by_user_id, @approved_by_name, @approved_at,
      @reopened_by_user_id, @reopened_by_name, @close_reason, @created_at, @updated_at
    )
  `,
  ).run(row);

  return rowToDetail(row);
}

export function approveTillLocal(input: {
  id: string;
  managerId: string;
  managerName: string;
}): TillSessionDetail {
  const row = getSession(input.id);
  if (!row) throw new Error("Till session not found");
  if (row.status !== "PENDING_APPROVAL") {
    throw new Error("Till session is not pending approval");
  }

  const db = getLocalDb();
  const now = new Date().toISOString();
  db.prepare(
    `
    update till_sessions
    set status = 'OPEN',
        approved_by_user_id = @managerId,
        approved_by_name = @managerName,
        approved_at = @now,
        updated_at = @now
    where id = @id and tenant_id = @tenantId
  `,
  ).run({
    id: input.id,
    tenantId: DEMO_STORE_TENANT_ID,
    managerId: input.managerId,
    managerName: input.managerName,
    now,
  });

  return rowToDetail(getSession(input.id)!);
}

export function withdrawTillLocal(input: {
  id: string;
  managerId: string;
  managerName: string;
  body: WithdrawTillRequest;
}): TillSessionDetail {
  const row = getSession(input.id);
  if (!row) throw new Error("Till session not found");
  if (row.status !== "CLOSED_LIMIT") {
    throw new Error("Till must be at cash limit before withdrawal");
  }

  const withdrawalTotal = computeTillDenominationTotal(input.body);
  if (withdrawalTotal <= 0) {
    throw new Error("Enter at least one note count to withdraw");
  }
  if (withdrawalTotal > row.current_cash_balance) {
    throw new Error("Withdrawal total exceeds current till cash balance");
  }

  const db = getLocalDb();
  const now = new Date().toISOString();
  db.prepare(
    `
    insert into till_withdrawals (
      id, tenant_id, till_session_id, withdrawn_by_user_id, withdrawn_by_name,
      note_10, note_20, note_50, note_100, note_500, note_1000, note_5000,
      withdrawal_total, kind, created_at
    ) values (
      @id, @tenantId, @tillSessionId, @withdrawnByUserId, @withdrawnByName,
      @note_10, @note_20, @note_50, @note_100, @note_500, @note_1000, @note_5000,
      @withdrawalTotal, @kind, @createdAt
    )
  `,
  ).run({
    id: randomUUID(),
    tenantId: DEMO_STORE_TENANT_ID,
    tillSessionId: input.id,
    withdrawnByUserId: input.managerId,
    withdrawnByName: input.managerName,
    note_10: input.body.note10,
    note_20: input.body.note20,
    note_50: input.body.note50,
    note_100: input.body.note100,
    note_500: input.body.note500,
    note_1000: input.body.note1000,
    note_5000: input.body.note5000,
    withdrawalTotal,
    kind: "full",
    createdAt: now,
  });

  db.prepare(
    `
    update till_sessions
    set status = 'CLOSED',
        closed_at = @now,
        close_reason = 'WITHDRAWN',
        updated_at = @now
    where id = @id and tenant_id = @tenantId
  `,
  ).run({ id: input.id, tenantId: DEMO_STORE_TENANT_ID, now });

  return rowToDetail(getSession(input.id)!);
}

export function collectCashLocal(input: {
  id: string;
  managerId: string;
  managerName: string;
  body: WithdrawTillRequest;
}): TillSessionDetail {
  const row = getSession(input.id);
  if (!row) throw new Error("Till session not found");
  if (row.status !== "OPEN" && row.status !== "CLOSED_LIMIT") {
    throw new Error("Till must be open or at cash limit to collect cash");
  }

  const withdrawalTotal = computeTillDenominationTotal(input.body);
  if (withdrawalTotal <= 0) {
    throw new Error("Enter at least one note count to collect");
  }
  if (withdrawalTotal > row.current_cash_balance) {
    throw new Error("Collection total exceeds current till cash balance");
  }

  const db = getLocalDb();
  const now = new Date().toISOString();
  db.prepare(
    `
    insert into till_withdrawals (
      id, tenant_id, till_session_id, withdrawn_by_user_id, withdrawn_by_name,
      note_10, note_20, note_50, note_100, note_500, note_1000, note_5000,
      withdrawal_total, kind, created_at
    ) values (
      @id, @tenantId, @tillSessionId, @withdrawnByUserId, @withdrawnByName,
      @note_10, @note_20, @note_50, @note_100, @note_500, @note_1000, @note_5000,
      @withdrawalTotal, @kind, @createdAt
    )
  `,
  ).run({
    id: randomUUID(),
    tenantId: DEMO_STORE_TENANT_ID,
    tillSessionId: input.id,
    withdrawnByUserId: input.managerId,
    withdrawnByName: input.managerName,
    note_10: input.body.note10,
    note_20: input.body.note20,
    note_50: input.body.note50,
    note_100: input.body.note100,
    note_500: input.body.note500,
    note_1000: input.body.note1000,
    note_5000: input.body.note5000,
    withdrawalTotal,
    kind: "partial",
    createdAt: now,
  });

  const nextBalance =
    Math.round((row.current_cash_balance - withdrawalTotal) * 10000) / 10000;
  const reopen =
    row.status === "CLOSED_LIMIT" && nextBalance < row.max_cash_limit;

  db.prepare(
    `
    update till_sessions
    set current_cash_balance = @nextBalance,
        status = @status,
        closed_at = @closedAt,
        close_reason = @closeReason,
        updated_at = @now
    where id = @id and tenant_id = @tenantId
  `,
  ).run({
    id: input.id,
    tenantId: DEMO_STORE_TENANT_ID,
    nextBalance,
    status: reopen ? "OPEN" : row.status,
    closedAt: reopen ? null : row.closed_at,
    closeReason: reopen ? null : row.close_reason,
    now,
  });

  return rowToDetail(getSession(input.id)!);
}

export function collectCashByAmountLocal(input: {
  userId: string;
  userName: string;
  amount: number;
  supervisorUserId?: string;
  collectedByName?: string;
}): TillSessionDetail {
  const row = findActiveSession(input.userId);
  if (!row) throw new Error("No active till session");
  if (row.status !== "OPEN" && row.status !== "CLOSED_LIMIT") {
    throw new Error("Till must be open or at cash limit to collect cash");
  }

  const withdrawalTotal =
    Math.round(input.amount * 10000) / 10000;
  if (withdrawalTotal <= 0) {
    throw new Error("Enter a valid cash received amount");
  }
  if (withdrawalTotal > row.current_cash_balance) {
    throw new Error("Collection amount exceeds current till cash balance");
  }

  const db = getLocalDb();
  const now = new Date().toISOString();
  const withdrawnByUserId = input.supervisorUserId ?? input.userId;
  const withdrawnByName = input.collectedByName?.trim() || "Manager";
  db.prepare(
    `
    insert into till_withdrawals (
      id, tenant_id, till_session_id, withdrawn_by_user_id, withdrawn_by_name,
      note_10, note_20, note_50, note_100, note_500, note_1000, note_5000,
      withdrawal_total, kind, created_at
    ) values (
      @id, @tenantId, @tillSessionId, @withdrawnByUserId, @withdrawnByName,
      0, 0, 0, 0, 0, 0, 0,
      @withdrawalTotal, @kind, @createdAt
    )
  `,
  ).run({
    id: randomUUID(),
    tenantId: DEMO_STORE_TENANT_ID,
    tillSessionId: row.id,
    withdrawnByUserId,
    withdrawnByName: input.userName,
    withdrawalTotal,
    kind: "partial",
    createdAt: now,
  });

  const nextBalance =
    Math.round((row.current_cash_balance - withdrawalTotal) * 10000) / 10000;
  const reopen =
    row.status === "CLOSED_LIMIT" && nextBalance < row.max_cash_limit;

  db.prepare(
    `
    update till_sessions
    set current_cash_balance = @nextBalance,
        status = @status,
        closed_at = @closedAt,
        close_reason = @closeReason,
        updated_at = @now
    where id = @id and tenant_id = @tenantId
  `,
  ).run({
    id: row.id,
    tenantId: DEMO_STORE_TENANT_ID,
    nextBalance,
    status: reopen ? "OPEN" : row.status,
    closedAt: reopen ? null : row.closed_at,
    closeReason: reopen ? null : row.close_reason,
    now,
  });

  return rowToDetail(getSession(row.id)!);
}

export function closeTillLocal(input: {
  userId: string;
  userName: string;
}): TillSessionDetail {
  const row = findActiveSession(input.userId);
  if (!row) throw new Error("No active till session");
  if (row.status !== "OPEN") {
    throw new Error("Till must be open to close");
  }

  const db = getLocalDb();
  const now = new Date().toISOString();
  db.prepare(
    `
    update till_sessions
    set status = 'CLOSED',
        closed_at = @closedAt,
        close_reason = @closeReason,
        updated_at = @now
    where id = @id and tenant_id = @tenantId
  `,
  ).run({
    id: row.id,
    tenantId: DEMO_STORE_TENANT_ID,
    closedAt: now,
    closeReason: TILL_CLOSE_REASON_CASHIER_CLOSED,
    now,
  });

  return rowToDetail(getSession(row.id)!);
}

export function reopenTillLocal(input: {
  id: string;
  managerId: string;
  managerName: string;
  body: ReopenTillRequest;
}): TillSessionDetail {
  const previous = getSession(input.id);
  if (!previous) throw new Error("Till session not found");
  if (previous.status !== "CLOSED") {
    throw new Error("Till must be closed before reopening");
  }

  const notesTotal = computeTillDenominationTotal(input.body);
  const amountOnly = notesTotal <= 0;
  const validationError = amountOnly
    ? validateTillOpeningBalanceAmount(input.body.openingBalance)
    : validateTillOpeningBalance(input.body, input.body.openingBalance);
  if (validationError) throw new Error(validationError);

  if (findActiveSession(previous.user_id)) {
    throw new Error("Cashier already has an active till session");
  }

  const db = getLocalDb();
  const now = new Date().toISOString();
  const openingBalance = input.body.openingBalance;
  const openingTotal = amountOnly ? openingBalance : notesTotal;
  const maxLimit = tillMaxLimit(openingBalance);
  const zeroNotes = amountOnly ? emptyTillNotes() : null;
  const supervisorId = input.body.supervisorUserId ?? input.managerId;

  const row: TillRow = {
    id: randomUUID(),
    tenant_id: DEMO_STORE_TENANT_ID,
    user_id: previous.user_id,
    user_name: previous.user_name,
    status: "OPEN",
    note_10: zeroNotes?.note10 ?? input.body.note10,
    note_20: zeroNotes?.note20 ?? input.body.note20,
    note_50: zeroNotes?.note50 ?? input.body.note50,
    note_100: zeroNotes?.note100 ?? input.body.note100,
    note_500: zeroNotes?.note500 ?? input.body.note500,
    note_1000: zeroNotes?.note1000 ?? input.body.note1000,
    note_5000: zeroNotes?.note5000 ?? input.body.note5000,
    opening_total: openingTotal,
    opening_balance: openingBalance,
    current_cash_balance: openingBalance,
    max_cash_limit: maxLimit,
    opened_at: now,
    closed_at: null,
    approved_by_user_id: supervisorId,
    approved_by_name: input.managerName,
    approved_at: now,
    reopened_by_user_id: supervisorId,
    reopened_by_name: input.managerName,
    close_reason: null,
    created_at: now,
    updated_at: now,
  };

  db.prepare(
    `
    insert into till_sessions (
      id, tenant_id, user_id, user_name, status,
      note_10, note_20, note_50, note_100, note_500, note_1000, note_5000,
      opening_total, opening_balance, current_cash_balance, max_cash_limit,
      opened_at, closed_at, approved_by_user_id, approved_by_name, approved_at,
      reopened_by_user_id, reopened_by_name, close_reason, created_at, updated_at
    ) values (
      @id, @tenant_id, @user_id, @user_name, @status,
      @note_10, @note_20, @note_50, @note_100, @note_500, @note_1000, @note_5000,
      @opening_total, @opening_balance, @current_cash_balance, @max_cash_limit,
      @opened_at, @closed_at, @approved_by_user_id, @approved_by_name, @approved_at,
      @reopened_by_user_id, @reopened_by_name, @close_reason, @created_at, @updated_at
    )
  `,
  ).run(row);

  return rowToDetail(row);
}

export function upsertTillSessionLocal(detail: TillSessionDetail): void {
  const db = getLocalDb();
  const now = new Date().toISOString();
  db.prepare(
    `
    insert into till_sessions (
      id, tenant_id, user_id, user_name, status,
      note_10, note_20, note_50, note_100, note_500, note_1000, note_5000,
      opening_total, opening_balance, current_cash_balance, max_cash_limit,
      opened_at, closed_at, approved_by_user_id, approved_by_name, approved_at,
      reopened_by_user_id, reopened_by_name, close_reason, created_at, updated_at
    ) values (
      @id, @tenant_id, @user_id, @user_name, @status,
      @note_10, @note_20, @note_50, @note_100, @note_500, @note_1000, @note_5000,
      @opening_total, @opening_balance, @current_cash_balance, @max_cash_limit,
      @opened_at, @closed_at, @approved_by_user_id, @approved_by_name, @approved_at,
      @reopened_by_user_id, @reopened_by_name, @close_reason, @created_at, @updated_at
    )
    on conflict(id) do update set
      user_name = excluded.user_name,
      status = excluded.status,
      note_10 = excluded.note_10,
      note_20 = excluded.note_20,
      note_50 = excluded.note_50,
      note_100 = excluded.note_100,
      note_500 = excluded.note_500,
      note_1000 = excluded.note_1000,
      note_5000 = excluded.note_5000,
      opening_total = excluded.opening_total,
      opening_balance = excluded.opening_balance,
      current_cash_balance = excluded.current_cash_balance,
      max_cash_limit = excluded.max_cash_limit,
      opened_at = excluded.opened_at,
      closed_at = excluded.closed_at,
      approved_by_user_id = excluded.approved_by_user_id,
      approved_by_name = excluded.approved_by_name,
      approved_at = excluded.approved_at,
      reopened_by_user_id = excluded.reopened_by_user_id,
      reopened_by_name = excluded.reopened_by_name,
      close_reason = excluded.close_reason,
      updated_at = excluded.updated_at
  `,
  ).run({
    id: detail.id,
    tenant_id: DEMO_STORE_TENANT_ID,
    user_id: detail.userId,
    user_name: detail.userName,
    status: detail.status,
    note_10: detail.note10,
    note_20: detail.note20,
    note_50: detail.note50,
    note_100: detail.note100,
    note_500: detail.note500,
    note_1000: detail.note1000,
    note_5000: detail.note5000,
    opening_total: detail.openingTotal,
    opening_balance: detail.openingBalance,
    current_cash_balance: detail.currentCashBalance,
    max_cash_limit: detail.maxCashLimit,
    opened_at: detail.openedAt,
    closed_at: detail.closedAt,
    approved_by_user_id: detail.approvedByUserId,
    approved_by_name: detail.approvedByName,
    approved_at: detail.approvedAt,
    reopened_by_user_id: detail.reopenedByUserId,
    reopened_by_name: detail.reopenedByName,
    close_reason: detail.closeReason,
    created_at: detail.createdAt ?? now,
    updated_at: detail.updatedAt ?? now,
  });
}

export function applyTillCashFromSaleLocal(input: {
  userId: string;
  cashPaymentTotal: number;
  skipForManager?: boolean;
}): void {
  if (input.skipForManager || input.cashPaymentTotal <= 0) return;

  const row = findActiveSession(input.userId);
  if (!row || row.status !== "OPEN") return;

  const db = getLocalDb();
  const nextBalance =
    Math.round((row.current_cash_balance + input.cashPaymentTotal) * 10000) /
    10000;
  const now = new Date().toISOString();

  if (nextBalance >= row.max_cash_limit) {
    db.prepare(
      `
      update till_sessions
      set current_cash_balance = @nextBalance,
          status = 'CLOSED_LIMIT',
          closed_at = @now,
          close_reason = 'LIMIT_REACHED',
          updated_at = @now
      where id = @id
    `,
    ).run({ id: row.id, nextBalance, now });
    return;
  }

  db.prepare(
    `
    update till_sessions
    set current_cash_balance = @nextBalance, updated_at = @now
    where id = @id
  `,
  ).run({ id: row.id, nextBalance, now });
}

export function assertTillCanPostSaleLocal(input: {
  userId: string;
  skipForManager?: boolean;
  cashPaymentTotal: number;
}): void {
  if (input.skipForManager) return;

  const row = findActiveSession(input.userId);
  if (!row || row.status !== "OPEN") {
    if (row?.status === "PENDING_APPROVAL") {
      throw new Error("Till is pending manager approval");
    }
    if (row?.status === "CLOSED_LIMIT") {
      throw new Error(
        "Till cash limit reached. Contact a manager to withdraw and reopen.",
      );
    }
    throw new Error("Open your till before posting sales");
  }

  if (input.cashPaymentTotal <= 0) return;
  const nextBalance =
    Math.round((row.current_cash_balance + input.cashPaymentTotal) * 10000) /
    10000;
  if (nextBalance > row.max_cash_limit) {
    throw new Error(
      "This sale would exceed the till cash limit. Contact a manager.",
    );
  }
}
