import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { SyncEntityType, SyncOperation, SyncStream } from "@blackbox/shared";
import { getLocalDb } from "./index";
import { readIdentity } from "./identity";
import { bumpLocalEntityVersion, getLocalEntityVersion } from "./entity-versions-local";
import { getSyncMeta, setSyncMeta } from "./sync-meta";

export type OutboxRow = {
  changeId: string;
  stream: SyncStream;
  entityType: SyncEntityType;
  entityId: string;
  operation: SyncOperation;
  payload: Record<string, unknown>;
  baseEntityVersion: number;
};

export function enqueueOutbox(input: {
  stream: SyncStream;
  entityType: SyncEntityType;
  entityId: string;
  operation: SyncOperation;
  payload: Record<string, unknown>;
  baseEntityVersion?: number;
}): string {
  const identity = readIdentity();
  if (!identity) {
    throw new Error("Device identity is not bound");
  }
  const changeId = randomUUID();
  const db = getLocalDb();
  const baseVersion = getLocalEntityVersion(input.entityType, input.entityId);
  db.prepare(
    `insert into local_sync_outbox (
      change_id, tenant_id, origin_device_id, stream, entity_type, entity_id,
      operation, payload, base_entity_version, status
    ) values (
      @changeId, @tenantId, @deviceId, @stream, @entityType, @entityId,
      @operation, @payload, @baseVersion, 'pending'
    )`,
  ).run({
    changeId,
    tenantId: identity.tenantId,
    deviceId: identity.deviceId,
    stream: input.stream,
    entityType: input.entityType,
    entityId: input.entityId,
    operation: input.operation,
    payload: JSON.stringify(input.payload),
    baseVersion,
  });
  if (input.operation !== "EVENT") {
    bumpLocalEntityVersion(input.entityType, input.entityId, baseVersion);
  }
  return changeId;
}

export function listPendingOutboxForEntity(
  entityType: string,
  entityId: string,
): OutboxRow[] {
  return listPendingOutboxRows(
    `status in ('pending', 'pushing')
       and entity_type = @entityType
       and entity_id = @entityId`,
    { entityType, entityId },
  );
}

export function listPendingOutbox(limit = 100): OutboxRow[] {
  return listPendingOutboxRows(
    `status in ('pending', 'pushing')`,
    {},
    "order by created_at, change_id limit @limit",
    { limit },
  );
}

function listPendingOutboxRows(
  where: string,
  whereParams: Record<string, string>,
  tail = "order by created_at, change_id",
  tailParams: Record<string, string | number> = {},
): OutboxRow[] {
  const rows = getLocalDb()
    .prepare(
      `select change_id as changeId, stream, entity_type as entityType,
              entity_id as entityId, operation, payload, base_entity_version as baseEntityVersion
       from local_sync_outbox
       where ${where}
       ${tail}`,
    )
    .all({ ...whereParams, ...tailParams }) as Array<OutboxRow & { payload: string }>;
  return rows.map((row) => ({
    ...row,
    payload: JSON.parse(row.payload) as Record<string, unknown>,
  }));
}

export function markOutboxPushing(ids: string[]): void {
  if (ids.length === 0) return;
  const db = getLocalDb();
  const stmt = db.prepare(
    `update local_sync_outbox set status = 'pushing', attempts = attempts + 1
     where change_id = @id`,
  );
  const run = db.transaction(() => {
    for (const id of ids) stmt.run({ id });
  });
  run();
}

export function markOutboxAcked(changeId: string, seq?: string): void {
  const db = getLocalDb();
  const run = db.transaction(() => {
    const row = db
      .prepare(
        `select stream, entity_type as entityType, entity_id as entityId,
                operation, base_entity_version as baseEntityVersion
         from local_sync_outbox where change_id = @changeId`,
      )
      .get({ changeId }) as
      | {
          stream: string;
          entityType: string;
          entityId: string;
          operation: string;
          baseEntityVersion: number;
        }
      | undefined;
    db.prepare(
      `update local_sync_outbox
       set status = 'acked', acked_at = datetime('now'), cloud_seq = @seq, last_error = null
       where change_id = @changeId`,
    ).run({ changeId, seq: seq ?? null });
    if (row && row.operation !== "EVENT") {
      bumpLocalEntityVersion(
        row.entityType,
        row.entityId,
        row.baseEntityVersion,
      );
    }
    if (seq && row) {
      recordApplied(changeId, Number(seq), row.stream);
    }
  });
  run();
}

export function markOutboxPending(changeId: string, error: string): void {
  getLocalDb()
    .prepare(
      `update local_sync_outbox
       set status = 'pending', last_error = @error
       where change_id = @changeId`,
    )
    .run({ changeId, error });
}

export function markOutboxRejected(changeId: string, error: string): void {
  getLocalDb()
    .prepare(
      `update local_sync_outbox
       set status = 'rejected', last_error = @error
       where change_id = @changeId`,
    )
    .run({ changeId, error });
}

export function resetStalePushing(conn?: Database.Database): void {
  const db = conn ?? getLocalDb();
  db.prepare(
      `update local_sync_outbox set status = 'pending'
       where status = 'pushing'
         and datetime(created_at) <= datetime('now', '-2 minutes')`,
    )
    .run();
}

export function getPullCursor(stream: string): string {
  const row = getLocalDb()
    .prepare(`select pull_cursor as cursor from local_sync_state where stream = @stream`)
    .get({ stream }) as { cursor: string } | undefined;
  return row?.cursor ?? "0";
}

export function setPullCursor(stream: string, cursor: string): void {
  getLocalDb()
    .prepare(
      `insert into local_sync_state (stream, pull_cursor, last_pull_at)
       values (@stream, @cursor, datetime('now'))
       on conflict(stream) do update set
         pull_cursor = excluded.pull_cursor,
         last_pull_at = excluded.last_pull_at,
         last_error = null`,
    )
    .run({ stream, cursor });
}

export function recordApplied(changeId: string, seq: number, stream: string): void {
  getLocalDb()
    .prepare(
      `insert or ignore into local_applied_changes (change_id, seq, stream)
       values (@changeId, @seq, @stream)`,
    )
    .run({ changeId, seq, stream });
}

export function wasApplied(changeId: string): boolean {
  const row = getLocalDb()
    .prepare(`select 1 as ok from local_applied_changes where change_id = @changeId`)
    .get({ changeId }) as { ok: number } | undefined;
  return Boolean(row);
}

const CASH_REJECT_RETRY_KEY = "cash_reject_retry_v1";

export function requeueRejectedCashOnce(): void {
  if (!readIdentity()) return;
  if (getSyncMeta(CASH_REJECT_RETRY_KEY)) return;
  getLocalDb()
    .prepare(
      `update local_sync_outbox
       set status = 'pending', last_error = null
       where status = 'rejected'
         and entity_type in (
           'cash_expense',
           'manager_drawer_opening',
           'manager_drawer_submission',
           'till_withdrawal'
         )`,
    )
    .run();
  setSyncMeta(CASH_REJECT_RETRY_KEY, new Date().toISOString());
}

const SALES_TILL_RETRY_KEY = "sales_till_reject_retry_v1";

export function requeueRejectedSalesAndTillsOnce(): void {
  if (!readIdentity()) return;
  if (getSyncMeta(SALES_TILL_RETRY_KEY)) return;
  const db = getLocalDb();
  db.prepare(
    `update local_sync_outbox
     set status = 'pending', last_error = null
     where status = 'rejected'
       and entity_type = 'sale'
       and last_error like '%No inventory out balance%'`,
  ).run();
  db.prepare(
    `update local_sync_outbox
     set status = 'pending', last_error = null
     where status = 'rejected'
       and entity_type = 'till_session'
       and last_error like '%till_sessions_active_user_idx%'
       and not exists (
         select 1 from local_sync_outbox newer
         where newer.entity_type = local_sync_outbox.entity_type
           and newer.entity_id = local_sync_outbox.entity_id
           and newer.status = 'acked'
           and newer.created_at > local_sync_outbox.created_at
       )`,
  ).run();
  setSyncMeta(SALES_TILL_RETRY_KEY, new Date().toISOString());
}

const VENDOR_EXPENSE_RETRY_KEY = "vendor_expense_category_retry_v1";

/** Resends vendor payment expenses the cloud refused before it allowed that category. */
export function requeueRejectedVendorExpensesOnce(): void {
  if (!readIdentity()) return;
  if (getSyncMeta(VENDOR_EXPENSE_RETRY_KEY)) return;
  getLocalDb()
    .prepare(
      `update local_sync_outbox
       set status = 'pending', last_error = null
       where status = 'rejected'
         and entity_type = 'cash_expense'
         and last_error like '%cash_expenses_category_check%'`,
    )
    .run();
  setSyncMeta(VENDOR_EXPENSE_RETRY_KEY, new Date().toISOString());
}

const VENDOR_LEDGER_FK_RETRY_KEY = "vendor_ledger_receipt_fk_retry_v1";

/** Resends ledger rows rejected before their purchase voucher existed on the cloud. */
export function requeueRejectedVendorLedgerOnce(): void {
  if (!readIdentity()) return;
  if (getSyncMeta(VENDOR_LEDGER_FK_RETRY_KEY)) return;
  getLocalDb()
    .prepare(
      `update local_sync_outbox
       set status = 'pending', last_error = null
       where status = 'rejected'
         and entity_type = 'vendor_ledger_entry'
         and last_error like '%vendor_ledger_entries_goods_receipt%'`,
    )
    .run();
  setSyncMeta(VENDOR_LEDGER_FK_RETRY_KEY, new Date().toISOString());
}

export function pendingOutboxCount(): number {
  const row = getLocalDb()
    .prepare(
      `select count(*) as n from local_sync_outbox where status in ('pending', 'pushing')`,
    )
    .get() as { n: number };
  return row.n;
}
