import type {
  ActivityLogItem,
  ActivityLogListQuery,
  CreateActivityLogRequest,
  PaginatedActivityLogs,
} from "@blackbox/shared";
import { apiFetch } from "./client";

export type ActivityLogDisplayNames = {
  actorName?: string;
  supervisorName?: string | null;
  subjectName?: string | null;
};

export const activityLogsApi = {
  list(query: ActivityLogListQuery = {}): Promise<PaginatedActivityLogs> {
    const params = new URLSearchParams();
    if (query.dateFrom) params.set("dateFrom", query.dateFrom);
    if (query.dateTo) params.set("dateTo", query.dateTo);
    if (query.eventType) params.set("eventType", query.eventType);
    if (query.page != null) params.set("page", String(query.page));
    if (query.pageSize != null) params.set("pageSize", String(query.pageSize));
    const q = params.toString() ? `?${params.toString()}` : "";
    return apiFetch<PaginatedActivityLogs>(`/activity-logs${q}`);
  },

  create(body: CreateActivityLogRequest & { id?: string }): Promise<void> {
    return apiFetch<void>("/activity-logs", {
      method: "POST",
      body: JSON.stringify(body),
    }).then(() => undefined);
  },
};

function buildLocalItem(
  id: string,
  payload: CreateActivityLogRequest,
  display?: ActivityLogDisplayNames,
): ActivityLogItem {
  const createdAt = new Date().toISOString();
  return {
    id,
    eventType: payload.eventType,
    actorUserId: payload.actorUserId,
    actorName: display?.actorName?.trim() || "—",
    supervisorUserId: payload.supervisorUserId ?? null,
    supervisorName: display?.supervisorName?.trim() || null,
    subjectUserId: payload.subjectUserId ?? null,
    subjectName: display?.subjectName?.trim() || null,
    summary: payload.summary,
    metadata: payload.metadata ?? {},
    createdAt,
  };
}

async function tryPostActivityLog(
  id: string,
  payload: CreateActivityLogRequest,
): Promise<boolean> {
  try {
    await activityLogsApi.create({ ...payload, id });
    await window.blackbox?.localDb?.markActivityLogSynced?.(id);
    await window.blackbox?.localDb?.deletePendingActivityLog?.(id);
    return true;
  } catch {
    return false;
  }
}

/**
 * Save locally first, queue for sync, then POST when online.
 */
export async function logActivityEvent(
  body: CreateActivityLogRequest,
  display?: ActivityLogDisplayNames,
): Promise<void> {
  const id = body.id ?? crypto.randomUUID();
  const payload = { ...body, id };
  const localItem = buildLocalItem(id, payload, display);

  if (window.blackbox?.localDb?.appendLocalActivityLog) {
    await window.blackbox.localDb.appendLocalActivityLog(localItem);
  }

  if (window.blackbox?.localDb?.appendPendingActivityLog) {
    await window.blackbox.localDb.appendPendingActivityLog({ id, payload });
  }

  await tryPostActivityLog(id, payload);
}

/** Flush all pending activity logs to the API. Returns count successfully synced. */
export async function flushPendingActivityLogs(): Promise<number> {
  const pending =
    (await window.blackbox?.localDb?.listPendingActivityLogs?.()) ?? [];
  let flushed = 0;
  for (const row of pending) {
    const ok = await tryPostActivityLog(row.id, row.payload);
    if (ok) flushed += 1;
  }
  return flushed;
}
