import type { SyncEntityType, SyncStream } from "@blackbox/shared";
import { syncApi } from "@renderer/lib/api/sync";

const VERSION_SEED_STREAMS: SyncStream[] = ["master_data", "purchasing"];

export async function seedEntityVersionHeadsFromCloud(
  streams: SyncStream[] = VERSION_SEED_STREAMS,
): Promise<void> {
  const bridge = window.blackbox?.sync;
  if (!bridge?.seedEntityVersions) return;

  for (const stream of streams) {
    let page = 1;
    let hasMore = true;
    while (hasMore) {
      const response = await syncApi.entityVersionHeads(stream, page);
      if (response.items.length > 0) {
        await bridge.seedEntityVersions(response.items);
      }
      hasMore = response.hasMore;
      page += 1;
    }
  }
}

export async function refreshEntityVersionHead(
  entityType: SyncEntityType,
  entityId: string,
): Promise<void> {
  const bridge = window.blackbox?.sync;
  if (!bridge?.seedEntityVersions) return;

  for (const stream of VERSION_SEED_STREAMS) {
    const response = await syncApi.entityVersionHeads(stream, 1, {
      entityType,
      entityId,
      pageSize: 1,
    });
    if (response.items.length > 0) {
      await bridge.seedEntityVersions(response.items);
      return;
    }
  }
}
