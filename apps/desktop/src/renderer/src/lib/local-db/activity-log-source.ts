import type {
  ActivityLogListQuery,
  PaginatedActivityLogs,
} from "@blackbox/shared";
import { activityLogsApi } from "@renderer/lib/api/activity-logs";

function mergeActivityLogs(
  local: PaginatedActivityLogs,
  remote: PaginatedActivityLogs,
): PaginatedActivityLogs {
  const byId = new Map<string, (typeof local.items)[number]>();
  for (const item of remote.items) {
    byId.set(item.id, item);
  }
  for (const item of local.items) {
    byId.set(item.id, item);
  }
  const items = [...byId.values()].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const page = local.page;
  const pageSize = local.pageSize;
  const start = (page - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    total: Math.max(local.total, items.length),
    page,
    pageSize,
  };
}

export async function loadActivityLogs(
  query: ActivityLogListQuery = {},
): Promise<PaginatedActivityLogs> {
  let local: PaginatedActivityLogs | null = null;
  try {
    local = (await window.blackbox?.localDb?.listLocalActivityLogs?.(query)) ?? null;
  } catch {
    local = null;
  }

  if (local) {
    try {
      const remote = await activityLogsApi.list(query);
      return mergeActivityLogs(local, remote);
    } catch {
      return local;
    }
  }

  return activityLogsApi.list(query);
}

export {
  logActivityEvent,
  flushPendingActivityLogs,
  type ActivityLogDisplayNames,
} from "@renderer/lib/api/activity-logs";
