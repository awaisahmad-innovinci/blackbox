import { ApiError } from "@renderer/lib/api/client";
import { inventoryMovementsApi } from "@renderer/lib/api/inventory-movements";

export const INVENTORY_MOVEMENTS_LAST_PULLED_AT_KEY =
  "inventory_movements_last_pulled_at";

const PAGE_SIZE = 100;

/** Download inventory movement history from the API into SQLite. */
export async function pullInventoryMovementsIntoLocal(): Promise<number> {
  const localDb = window.blackbox?.localDb;
  const upsert = localDb?.upsertInventoryMovements;
  if (!upsert || !localDb?.getSyncMeta || !localDb?.setSyncMeta) {
    return 0;
  }

  const lastPulled = await localDb.getSyncMeta(INVENTORY_MOVEMENTS_LAST_PULLED_AT_KEY);
  const since = lastPulled?.trim() || undefined;

  let page = 1;
  let merged = 0;
  let maxAt = lastPulled?.trim() ?? "";

  try {
    while (true) {
      const result = await inventoryMovementsApi.list({
        page,
        pageSize: PAGE_SIZE,
        since,
      });
      if (result.items.length > 0) {
        await upsert(result.items);
        merged += result.items.length;
        for (const row of result.items) {
          const at = row.createdAt ?? "";
          if (at > maxAt) maxAt = at;
        }
      }
      if (result.items.length === 0 || page * result.pageSize >= result.total) {
        break;
      }
      page += 1;
    }
  } catch (error: unknown) {
    if (error instanceof ApiError && error.status === 403) {
      return 0;
    }
    throw error;
  }

  await localDb.setSyncMeta(
    INVENTORY_MOVEMENTS_LAST_PULLED_AT_KEY,
    maxAt.trim() || new Date().toISOString(),
  );
  return merged;
}