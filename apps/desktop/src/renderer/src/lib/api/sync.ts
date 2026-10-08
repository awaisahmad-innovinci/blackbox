import type {
  SyncChangeInput,
  SyncEntityVersionHeadsResponse,
  SyncPushResponse,
  SyncPullResponse,
  SyncStatusResponse,
  SyncStream,
  SyncEntityType,
} from "@blackbox/shared";
import { SYNC_STREAMS } from "@blackbox/shared";
import { apiFetch } from "./client";
import { flushPendingActivityLogs } from "./activity-logs";

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
    const message = error instanceof Error ? error.message : "push failed";
    for (const row of batch) {
      await bridge.markPending(row.changeId, message);
    }
    throw error;
  }
}

export async function runIncrementalSync(): Promise<IncrementalSyncResult> {
  await flushPendingActivityLogs().catch(() => undefined);

  const bridge = window.blackbox?.sync;
  if (!bridge) return { pushed: 0, pulled: 0 };

  let pushed = 0;
  let pulled = 0;

  const pending = (await bridge.listOutbox(100)) as OutboxRow[];
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

  const status = await syncApi.status();

  for (const stream of SYNC_STREAMS) {
    if (stream === "auth_snapshot") continue;

    const streamStatus = status.streams.find((row) => row.stream === stream);
    if (streamStatus && streamStatus.lag === 0) continue;

    let hasMore = true;
    while (hasMore) {
      const cursor = await bridge.pullCursor(stream);
      const page = await syncApi.pull(stream, cursor);
      await bridge.applyPull({
        changes: page.changes,
        nextCursor: page.nextCursor,
        stream,
      });
      pulled += page.changes.length;
      hasMore = page.hasMore;
    }
  }

  return { pushed, pulled };
}
