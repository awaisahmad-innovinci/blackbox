import type {
  ActivityLogListQuery,
  PaginatedActivityLogs,
} from "@blackbox/shared";
import { activityLogsApi } from "@renderer/lib/api/activity-logs";

export async function loadActivityLogs(
  query: ActivityLogListQuery = {},
): Promise<PaginatedActivityLogs> {
  const online =
    typeof navigator === "undefined" || navigator.onLine !== false;
  if (online) {
    try {
      return await activityLogsApi.list(query);
    } catch {
      /* this device's copy is the fallback */
    }
  }

  try {
    const local = await window.blackbox?.localDb?.listLocalActivityLogs?.(query);
    if (local) return local;
  } catch {
    /* fall through to API */
  }

  return activityLogsApi.list(query);
}

export {
  logActivityEvent,
  flushPendingActivityLogs,
  type ActivityLogDisplayNames,
} from "@renderer/lib/api/activity-logs";