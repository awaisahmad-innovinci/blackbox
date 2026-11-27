import type {
  ActivityLogItem,
  InventoryMovementListItem,
  SyncCatalogActivityLogsPage,
  SyncCatalogDocumentKind,
  SyncCatalogInventoryMovementsPage,
  SyncCatalogPage,
  SyncCatalogProductRow,
  SyncCatalogReference,
  SyncCatalogVendorRow,
  SyncCashLedgerBootstrapPage,
  SyncCashLedgerSection,
  SyncChangeInput,
  SyncEntityVersionHeadsResponse,
  SyncPushResponse,
  SyncPullResponse,
  SyncStatusResponse,
  SyncStream,
  SyncEntityType,
  WarehouseStockRow,
} from "@blackbox/shared";
import { SYNC_CATALOG_PAGE_SIZE, SYNC_STREAMS } from "@blackbox/shared";
import { fetchCurrentDevice } from "./auth";
import { apiFetch } from "./client";
import { flushPendingActivityLogs } from "./activity-logs";
import {
  isDeviceRevokedMessage,
  notifyDeviceRevoked,
} from "@renderer/lib/session/device-lock";
import { bumpDataVersion } from "@renderer/lib/sync/sync-status";

export const syncApi = {
  push(stream: SyncStream, changes: SyncChangeInput[]) {
    return apiFetch<SyncPushResponse>("/sync/push", {
      method: "POST",
      body: JSON.stringify({ stream, changes }),
    });
  },
  pull(stream: SyncStream, cursor: string, limit?: number) {
    const q = new URLSearchParams({ stream, cursor });
    if (limit) q.set("limit", String(limit));
    return apiFetch<SyncPullResponse>(`/sync/pull?${q.toString()}`);
  },
  status() {
    return apiFetch<SyncStatusResponse>("/sync/status");
  },
  completeFullResync() {
    return apiFetch<{ ok: true }>("/sync/full-resync-complete", {
      method: "POST",
    });
  },
  catalogReference() {
    return apiFetch<SyncCatalogReference>("/sync/catalog?section=reference");
  },
  catalogProducts(page: number, pageSize = SYNC_CATALOG_PAGE_SIZE) {
    const q = new URLSearchParams({
      section: "products",
      page: String(page),
      pageSize: String(pageSize),
    });
    return apiFetch<SyncCatalogPage<SyncCatalogProductRow>>(
      `/sync/catalog?${q.toString()}`,
    );
  },
  catalogVendors(page: number, pageSize = SYNC_CATALOG_PAGE_SIZE) {
    const q = new URLSearchParams({
      section: "vendors",
      page: String(page),
      pageSize: String(pageSize),
    });
    return apiFetch<SyncCatalogPage<SyncCatalogVendorRow>>(
      `/sync/catalog?${q.toString()}`,
    );
  },
  catalogStock(page: number, pageSize = SYNC_CATALOG_PAGE_SIZE) {
    const q = new URLSearchParams({
      section: "stock",
      page: String(page),
      pageSize: String(pageSize),
    });
    return apiFetch<SyncCatalogPage<WarehouseStockRow>>(
      `/sync/catalog?${q.toString()}`,
    );
  },
  catalogActivityLogs(
    page: number,
    pageSize = SYNC_CATALOG_PAGE_SIZE,
  ): Promise<SyncCatalogActivityLogsPage> {
    const q = new URLSearchParams({
      section: "activityLogs",
      page: String(page),
      pageSize: String(pageSize),
    });
    return apiFetch<SyncCatalogPage<ActivityLogItem>>(
      `/sync/catalog?${q.toString()}`,
    );
  },
  catalogInventoryMovements(
    page: number,
    pageSize = SYNC_CATALOG_PAGE_SIZE,
  ): Promise<SyncCatalogInventoryMovementsPage> {
    const q = new URLSearchParams({
      section: "inventoryMovements",
      page: String(page),
      pageSize: String(pageSize),
    });
    return apiFetch<SyncCatalogPage<InventoryMovementListItem>>(
      `/sync/catalog?${q.toString()}`,
    );
  },
  catalogDocuments<T>(
    kind: SyncCatalogDocumentKind,
    page: number,
    pageSize = SYNC_CATALOG_PAGE_SIZE,
  ) {
    const q = new URLSearchParams({
      section: "documents",
      kind,
      page: String(page),
      pageSize: String(pageSize),
    });
    return apiFetch<SyncCatalogPage<T>>(`/sync/catalog?${q.toString()}`);
  },
  entityVersionHeads(
    stream: SyncStream,
    page = 1,
    options?: {
      pageSize?: number;
      entityType?: SyncEntityType;
      entityId?: string;
    },
  ) {
    const q = new URLSearchParams({
      stream,
      page: String(page),
    });
    if (options?.pageSize) q.set("pageSize", String(options.pageSize));
    if (options?.entityType) q.set("entityType", options.entityType);
    if (options?.entityId) q.set("entityId", options.entityId);
    return apiFetch<SyncEntityVersionHeadsResponse>(
      `/sync/entity-version-heads?${q.toString()}`,
    );
  },
  cashLedger(
    section: SyncCashLedgerSection,
    page: number,
    pageSize = SYNC_CATALOG_PAGE_SIZE,
  ) {
    const q = new URLSearchParams({
      section,
      page: String(page),
      pageSize: String(pageSize),
    });
    return apiFetch<SyncCashLedgerBootstrapPage>(
      `/sync/cash-ledger?${q.toString()}`,
    );
  },
};

export type IncrementalSyncResult = {
  /** Outbox rows the cloud accepted (or recognised as duplicates). */
  pushed: number;
  /** Change-log rows applied to the local database. */
  pulled: number;
};

type SyncBridge = NonNullable<NonNullable<typeof window.blackbox>["sync"]>;

type OutboxRow = {
  changeId: string;
  entityType: string;
  entityId: string;
  operation: "UPSERT" | "DELETE" | "EVENT";
  payload: Record<string, unknown>;
  baseEntityVersion: number;
  stream: SyncStream;
};

const VERSION_HEAD_STREAMS: SyncStream[] = ["master_data", "purchasing"];

const POS_BALANCE_ENTITY_TYPES = new Set<string>([
  "sale",
  "sale_return",
  "inventory_out",
  "inventory_out_return",
]);

function touchesPosBalanceEntityType(entityType: string): boolean {
  return POS_BALANCE_ENTITY_TYPES.has(entityType);
}

async function countPendingLocalActivityLogs(): Promise<number> {
  const rows =
    (await window.blackbox?.localDb?.listPendingActivityLogs?.()) ?? [];
  return rows.length;
}

async function flushPendingActivityLogsIfAny(): Promise<void> {
  if ((await countPendingLocalActivityLogs()) === 0) return;
  await flushPendingActivityLogs().catch(() => undefined);
}

async function streamNeedsPull(
  bridge: SyncBridge,
  status: SyncStatusResponse,
  stream: SyncStream,
): Promise<boolean> {
  if (stream === "auth_snapshot") return false;
  const streamStatus = status.streams.find((row) => row.stream === stream);
  if (!streamStatus) return false;
  const localCursor = Number(await bridge.pullCursor(stream));
  const streamHead = Number(streamStatus.serverSeq);
  if (!Number.isFinite(localCursor) || !Number.isFinite(streamHead)) {
    return streamStatus.lag > 0;
  }
  return localCursor < streamHead;
}

async function anyStreamNeedsPull(
  bridge: SyncBridge,
  status: SyncStatusResponse,
): Promise<boolean> {
  for (const stream of SYNC_STREAMS) {
    if (await streamNeedsPull(bridge, status, stream)) return true;
  }
  return false;
}

async function refreshEntityVersionHeadAfterReject(
  bridge: SyncBridge,
  entityType: SyncEntityType,
  entityId: string,
): Promise<void> {
  if (!bridge.seedEntityVersions) return;
  for (const stream of VERSION_HEAD_STREAMS) {
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

async function pushOutboxBatch(
  bridge: SyncBridge,
  stream: SyncStream,
  batch: OutboxRow[],
): Promise<number> {
  if (batch.length === 0) return 0;

  await bridge.markPushing(batch.map((row) => row.changeId));
  try {
    const result = await syncApi.push(
      stream,
      batch.map((row) => ({
        changeId: row.changeId,
        entityType: row.entityType as SyncChangeInput["entityType"],
        entityId: row.entityId,
        operation: row.operation,
        baseEntityVersion: row.baseEntityVersion,
        payload: row.payload,
      })),
    );
    let pushed = 0;
    for (const item of result.results) {
      if (item.status === "acked" || item.status === "duplicate") {
        await bridge.markAcked(item.changeId, item.seq);
        pushed += 1;
      } else if (item.status === "rejected" && item.retryable) {
        await bridge.markPending(item.changeId, item.message ?? item.status);
      } else if (item.status === "conflict" || item.status === "rejected") {
        await bridge.markRejected(item.changeId, item.message ?? item.status);
        const row = batch.find((entry) => entry.changeId === item.changeId);
        if (row) {
          await refreshEntityVersionHeadAfterReject(
            bridge,
            row.entityType as SyncEntityType,
            row.entityId,
          ).catch(() => undefined);
        }
      }
    }
    return pushed;
  } catch (error: unknown) {
    if (isDeviceRevokedMessage(error)) throw error;
    const message = error instanceof Error ? error.message : "push failed";
    for (const row of batch) {
      await bridge.markPending(row.changeId, message).catch(() => undefined);
    }
    throw error;
  }
}

export async function runIncrementalSync(): Promise<IncrementalSyncResult> {
  const device = await fetchCurrentDevice();
  if (device?.status === "revoked") {
    notifyDeviceRevoked();
    throw new Error("This device cannot sync until it is trusted");
  }
  if (device?.wipeLocalData) {
    throw new Error(
      "This device is still restoring. Wait for the download to finish.",
    );
  }
  if (!device || device.status !== "trusted") {
    throw new Error("This device cannot sync until it is trusted");
  }

  const bridge = window.blackbox?.sync;
  if (!bridge) return { pushed: 0, pulled: 0 };

  let pending: OutboxRow[];
  try {
    pending = (await bridge.listOutbox(100)) as OutboxRow[];
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    if (/erased|not initialized|not trusted/i.test(msg)) {
      throw new Error(
        "Local database is restoring — try again in a moment.",
      );
    }
    throw error;
  }

  const status = await syncApi.status();
  const needsPull = await anyStreamNeedsPull(bridge, status);
  const pendingActivityLogs = await countPendingLocalActivityLogs();

  if (pending.length === 0 && !needsPull && pendingActivityLogs === 0) {
    return { pushed: 0, pulled: 0 };
  }

  await flushPendingActivityLogsIfAny();

  let pushed = 0;
  let pulled = 0;
  let needsPosBalanceRebuild =
    pending.some((row) => touchesPosBalanceEntityType(row.entityType));

  if (pending.length > 0) {
    const byStream = new Map<SyncStream, OutboxRow[]>();
    for (const row of pending) {
      const batch = byStream.get(row.stream) ?? [];
      batch.push(row);
      byStream.set(row.stream, batch);
    }
    for (const [stream, batch] of byStream) {
      if (stream === "auth_snapshot") continue;
      pushed += await pushOutboxBatch(bridge, stream, batch);
    }
  }

  let pullStatus = status;
  let shouldPull = needsPull;
  if (pushed > 0) {
    pullStatus = await syncApi.status();
    shouldPull = await anyStreamNeedsPull(bridge, pullStatus);
  }

  if (shouldPull) {
    for (const stream of SYNC_STREAMS) {
      if (stream === "auth_snapshot") continue;
      if (!(await streamNeedsPull(bridge, pullStatus, stream))) continue;

      let hasMore = true;
      while (hasMore) {
        const cursor = await bridge.pullCursor(stream);
        const page = await syncApi.pull(stream, cursor);
        await bridge.applyPull({
          changes: page.changes,
          nextCursor: page.nextCursor,
          stream,
        });
        for (const change of page.changes) {
          if (touchesPosBalanceEntityType(change.entityType)) {
            needsPosBalanceRebuild = true;
          }
        }
        pulled += page.changes.length;
        hasMore = page.hasMore;
      }
    }
  }

  if (needsPosBalanceRebuild) {
    await window.blackbox?.localDb?.rebuildPosBalanceFromDocuments?.();
    bumpDataVersion();
  }

  return { pushed, pulled };
}