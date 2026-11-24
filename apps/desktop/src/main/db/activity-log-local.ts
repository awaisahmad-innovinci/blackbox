import {
  businessDayEndUtc,
  businessDayStartUtc,
  type ActivityLogEventType,
  type ActivityLogItem,
  type ActivityLogListQuery,
  type CreateActivityLogRequest,
  type PaginatedActivityLogs,
} from "@blackbox/shared";
import { getLocalDb } from "./index";

export type PendingActivityLogRow = {
  id: string;
  payload: CreateActivityLogRequest;
  createdAt: string;
};

type PendingRow = {
  id: string;
  payload: string;
  created_at: string;
};

type LocalActivityLogRow = {
  id: string;
  event_type: string;
  actor_user_id: string;
  actor_name: string;
  supervisor_user_id: string | null;
  supervisor_name: string | null;
  subject_user_id: string | null;
  subject_name: string | null;
  summary: string;
  metadata: string;
  created_at: string;
  synced_at: string | null;
};

function rowToItem(row: LocalActivityLogRow): ActivityLogItem {
  return {
    id: row.id,
    eventType: row.event_type as ActivityLogEventType,
    actorUserId: row.actor_user_id,
    actorName: row.actor_name,
    supervisorUserId: row.supervisor_user_id,
    supervisorName: row.supervisor_name,
    subjectUserId: row.subject_user_id,
    subjectName: row.subject_name,
    summary: row.summary,
    metadata: JSON.parse(row.metadata) as Record<string, unknown>,
    createdAt: row.created_at,
  };
}

function upsertActivityLogRow(
  db: ReturnType<typeof getLocalDb>,
  item: ActivityLogItem,
  syncedAt: string | null,
): void {
  db.prepare(
    `
    insert into activity_logs (
      id, event_type, actor_user_id, actor_name,
      supervisor_user_id, supervisor_name, subject_user_id, subject_name,
      summary, metadata, created_at, synced_at
    ) values (
      @id, @eventType, @actorUserId, @actorName,
      @supervisorUserId, @supervisorName, @subjectUserId, @subjectName,
      @summary, @metadata, @createdAt, @syncedAt
    )
    on conflict(id) do update set
      event_type = excluded.event_type,
      actor_user_id = excluded.actor_user_id,
      actor_name = excluded.actor_name,
      supervisor_user_id = excluded.supervisor_user_id,
      supervisor_name = excluded.supervisor_name,
      subject_user_id = excluded.subject_user_id,
      subject_name = excluded.subject_name,
      summary = excluded.summary,
      metadata = excluded.metadata,
      created_at = excluded.created_at,
      synced_at = coalesce(synced_at, excluded.synced_at)
  `,
  ).run({
    id: item.id,
    eventType: item.eventType,
    actorUserId: item.actorUserId,
    actorName: item.actorName,
    supervisorUserId: item.supervisorUserId,
    supervisorName: item.supervisorName,
    subjectUserId: item.subjectUserId,
    subjectName: item.subjectName,
    summary: item.summary,
    metadata: JSON.stringify(item.metadata ?? {}),
    createdAt: item.createdAt,
    syncedAt,
  });
}

export function appendLocalActivityLog(item: ActivityLogItem): void {
  const db = getLocalDb();
  upsertActivityLogRow(db, item, null);
}

/** Merge tenant activity logs downloaded from the API during incremental sync. */
export function upsertActivityLogsFromPull(items: ActivityLogItem[]): void {
  if (items.length === 0) return;
  const db = getLocalDb();
  const syncedAt = new Date().toISOString();
  const tx = db.transaction((rows: ActivityLogItem[]) => {
    for (const item of rows) {
      upsertActivityLogRow(db, item, syncedAt);
    }
  });
  tx(items);
}

export function listLocalActivityLogs(
  query: ActivityLogListQuery = {},
): PaginatedActivityLogs {
  const db = getLocalDb();
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25));
  const offset = (page - 1) * pageSize;

  const conditions: string[] = [];
  const params: Record<string, string> = {};

  if (query.eventType) {
    conditions.push("event_type = @eventType");
    params.eventType = query.eventType;
  }
  if (query.dateFrom) {
    conditions.push("created_at >= @dateFrom");
    params.dateFrom = businessDayStartUtc(query.dateFrom);
  }
  if (query.dateTo) {
    conditions.push("created_at <= @dateTo");
    params.dateTo = businessDayEndUtc(query.dateTo);
  }

  const where = conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";

  const totalRow = db
    .prepare(`select count(*) as count from activity_logs ${where}`)
    .get(params) as { count: number };

  const rows = db
    .prepare(
      `
      select
        id, event_type, actor_user_id, actor_name,
        supervisor_user_id, supervisor_name, subject_user_id, subject_name,
        summary, metadata, created_at, synced_at
      from activity_logs
      ${where}
      order by created_at desc
      limit @limit offset @offset
    `,
    )
    .all({ ...params, limit: pageSize, offset }) as LocalActivityLogRow[];

  return {
    items: rows.map(rowToItem),
    total: Number(totalRow.count),
    page,
    pageSize,
  };
}

export function markActivityLogSynced(id: string): void {
  const db = getLocalDb();
  db.prepare(
    `update activity_logs set synced_at = @syncedAt where id = @id`,
  ).run({
    id,
    syncedAt: new Date().toISOString(),
  });
}

export function appendPendingActivityLog(
  id: string,
  payload: CreateActivityLogRequest,
): void {
  const db = getLocalDb();
  db.prepare(
    `
    insert into activity_log_pending (id, payload, created_at)
    values (@id, @payload, @createdAt)
    on conflict(id) do update set payload = excluded.payload
  `,
  ).run({
    id,
    payload: JSON.stringify(payload),
    createdAt: new Date().toISOString(),
  });
}

export function listPendingActivityLogs(): PendingActivityLogRow[] {
  const db = getLocalDb();
  const rows = db
    .prepare(
      `select id, payload, created_at from activity_log_pending order by created_at asc`,
    )
    .all() as PendingRow[];

  return rows.map((row) => ({
    id: row.id,
    payload: JSON.parse(row.payload) as CreateActivityLogRequest,
    createdAt: row.created_at,
  }));
}

export function deletePendingActivityLog(id: string): void {
  const db = getLocalDb();
  db.prepare(`delete from activity_log_pending where id = @id`).run({ id });
}

export function countPendingActivityLogs(): number {
  const db = getLocalDb();
  const row = db
    .prepare(`select count(*) as count from activity_log_pending`)
    .get() as { count: number };
  return row.count;
}
