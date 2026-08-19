import type { SyncEntityType, SyncOperation } from "@blackbox/shared";
import { streamForEntity } from "@blackbox/shared";

export async function isDeviceBound(): Promise<boolean> {
  const identity = await window.blackbox?.identity?.get();
  return Boolean(identity);
}

let knownDeviceRevoked = false;

/** Kept in sync by the session provider so writes can be blocked after revoke. */
export function setDeviceRevoked(revoked: boolean): void {
  knownDeviceRevoked = revoked;
}

export async function commitLocalChange(input: {
  entityType: SyncEntityType;
  entityId: string;
  operation: SyncOperation;
  payload: Record<string, unknown>;
  baseEntityVersion?: number;
}): Promise<string> {
  if (knownDeviceRevoked) {
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
    baseEntityVersion: input.baseEntityVersion ?? 0,
  });
  return result.changeId;
}
