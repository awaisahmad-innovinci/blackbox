import type {
  SyncChangeInput,
  SyncPushResponse,
  SyncPullResponse,
  SyncStatusResponse,
  SyncStream,
} from "@blackbox/shared";
import { SYNC_STREAMS } from "@blackbox/shared";
import { apiFetch } from "./client";

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
};

export type IncrementalSyncResult = {
  /** Outbox rows the cloud accepted (or recognised as duplicates). */
  pushed: number;
  /** Change-log rows applied to the local database. */
  pulled: number;
};

export async function runIncrementalSync(): Promise<IncrementalSyncResult> {
  const bridge = window.blackbox?.sync;
  if (!bridge) return { pushed: 0, pulled: 0 };

  let pushed = 0;
  let pulled = 0;

  for (const stream of SYNC_STREAMS) {
    if (stream === "auth_snapshot") continue;
    const pending = (await bridge.listOutbox(100)) as Array<{
      changeId: string;
      entityType: string;
      entityId: string;
      operation: "UPSERT" | "DELETE" | "EVENT";
      payload: Record<string, unknown>;
      baseEntityVersion: number;
      stream: SyncStream;
    }>;
    const batch = pending.filter((row) => row.stream === stream);
    if (batch.length > 0) {
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
        for (const item of result.results) {
          if (item.status === "acked" || item.status === "duplicate") {
            await bridge.markAcked(item.changeId, item.seq);
            pushed += 1;
          } else if (item.status === "conflict" || item.status === "rejected") {
            await bridge.markRejected(item.changeId, item.message ?? item.status);
          }
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "push failed";
        for (const row of batch) {
          await bridge.markPending(row.changeId, message);
        }
        throw error;
      }
    }

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
