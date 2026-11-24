import { activityLogsApi } from "@renderer/lib/api/activity-logs";

export const ACTIVITY_LOGS_LAST_PULLED_AT_KEY = "activity_logs_last_pulled_at";

const PAGE_SIZE = 100;

/** Download tenant activity logs from the API into SQLite (incremental sync). */
export async function pullActivityLogsIntoLocal(): Promise<number> {
  const localDb = window.blackbox?.localDb;
  const upsert = localDb?.upsertActivityLogsFromPull;
  if (!upsert || !localDb?.getSyncMeta || !localDb?.setSyncMeta) {
    return 0;
  }

  const lastPulled = await localDb.getSyncMeta(ACTIVITY_LOGS_LAST_PULLED_AT_KEY);
  const trimmed = lastPulled?.trim() ?? "";
  // API dateFrom expects YYYY-MM-DD (business-day start), not full ISO.
  const dateFrom =
    trimmed.length >= 10 ? trimmed.slice(0, 10) : undefined;

  let page = 1;
  let merged = 0;
  let maxCreatedAt = lastPulled?.trim() ?? "";

  while (true) {
    const result = await activityLogsApi.list({
      page,
      pageSize: PAGE_SIZE,
      dateFrom,
    });
    if (result.items.length > 0) {
      await upsert(result.items);
      merged += result.items.length;
      for (const item of result.items) {
        if (item.createdAt > maxCreatedAt) {
          maxCreatedAt = item.createdAt;
        }
      }
    }
    if (result.items.length === 0 || page * result.pageSize >= result.total) {
      break;
    }
    page += 1;
  }

  const watermark =
    maxCreatedAt.trim() || new Date().toISOString();
  await localDb.setSyncMeta(ACTIVITY_LOGS_LAST_PULLED_AT_KEY, watermark);

  return merged;
}