import type { SyncEntityType, SyncOperation } from "@blackbox/shared";
import { streamForEntity } from "@blackbox/shared";
import { bumpDataVersion } from "@renderer/lib/sync/sync-status";

export async function isDeviceBound(): Promise<boolean> {
  const identity = await window.blackbox?.identity?.get();
  return Boolean(identity);
}

export type LocalWriteBlock = "none" | "pending" | "revoked";

let localWriteBlock: LocalWriteBlock = "none";

/** Kept in sync by the session provider so writes can be blocked while pending or revoked. */
export function setLocalWritesBlocked(block: LocalWriteBlock): void {
  localWriteBlock = block;
}

export async function commitLocalChange(input: {
  entityType: SyncEntityType;
  entityId: string;
  operation: SyncOperation;
  payload: Record<string, unknown>;
  baseEntityVersion?: number;
}): Promise<string> {
  if (localWriteBlock === "pending") {
    throw new Error(
      "This device is awaiting owner approval. Ask an owner to trust it before making changes.",
    );
  }
  if (localWriteBlock === "revoked") {
    throw new Error(
      "This device was revoked. Ask an owner to trust it again before making changes.",
    );
  }
  const commit = window.blackbox?.sync?.commit;
  if (!commit) {
    throw new Error("Local sync commit is not available");
  }
  const result = await commit({
    stream: streamForEntity(input.entityType),
    entityType: input.entityType,
    entityId: input.entityId,
    operation: input.operation,
    payload: input.payload,
    ...(input.baseEntityVersion !== undefined
      ? { baseEntityVersion: input.baseEntityVersion }
      : {}),
  });
  bumpDataVersion();
  return result.changeId;
}