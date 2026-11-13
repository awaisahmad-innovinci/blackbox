import { useSyncExternalStore } from "react";
import { getApiErrorMessage } from "@renderer/lib/api/client";
import { runIncrementalSync } from "@renderer/lib/api/sync";
import { refreshSupervisorTotpCache } from "@renderer/lib/api/totp";
import { refreshSessionUserFromApi } from "@renderer/lib/session/session-user-refresh";

export type SyncStatusState = {
  syncing: boolean;
  pending: number;
  lastError: string | null;
  lastSyncedAt: string | null;
  /** True when the last failure was a transport error rather than a rejection. */
  offline: boolean;
  /** Bumped whenever a sync moved rows, so screens can refetch. */
  dataVersion: number;
};

let state: SyncStatusState = {
  syncing: false,
  pending: 0,
  lastError: null,
  lastSyncedAt: null,
  offline: false,
  dataVersion: 0,
};

const listeners = new Set<() => void>();

function setState(patch: Partial<SyncStatusState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSyncStatus(): SyncStatusState {
  return state;
}

export function useSyncStatus(): SyncStatusState {
  return useSyncExternalStore(subscribe, getSyncStatus, getSyncStatus);
}

function getDataVersion(): number {
  return state.dataVersion;
}

/** Include in an effect's deps to refetch after a sync changed local data. */
export function useSyncDataVersion(): number {
  return useSyncExternalStore(subscribe, getDataVersion, getDataVersion);
}

/** Lets non-sync writers (full pull, imports) invalidate open screens. */
export function bumpDataVersion(): void {
  setState({ dataVersion: state.dataVersion + 1 });
}

export async function refreshPendingCount(): Promise<void> {
  const count = await window.blackbox?.sync?.pendingCount();
  setState({ pending: count ?? 0 });
}

/**
 * Runs an incremental sync and records the outcome in the shared store so the
 * shell can show pending/failed state instead of silently dropping the error.
 */
export async function syncNow(): Promise<boolean> {
  if (state.syncing) return false;
  setState({ syncing: true });
  try {
    const { pushed, pulled } = await runIncrementalSync();
    void refreshSupervisorTotpCache();
    await refreshSessionUserFromApi();
    setState({
      lastError: null,
      offline: false,
      lastSyncedAt: new Date().toISOString(),
      dataVersion:
        pushed + pulled > 0 ? state.dataVersion + 1 : state.dataVersion,
    });
    // #region agent log
    fetch("http://127.0.0.1:7686/ingest/ab68d8f7-59f7-4472-9baa-3354161bb732",{method:"POST",headers:{"Content-Type":"application/json","X-Debug-Session-Id":"abae79"},body:JSON.stringify({sessionId:"abae79",runId:"run1",hypothesisId:"A-D",location:"sync-status.ts:syncNow",message:"incremental sync ok",data:{pushed,pulled},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    return true;
  } catch (error: unknown) {
    const offline = error instanceof TypeError;
    // #region agent log
    fetch("http://127.0.0.1:7686/ingest/ab68d8f7-59f7-4472-9baa-3354161bb732",{method:"POST",headers:{"Content-Type":"application/json","X-Debug-Session-Id":"abae79"},body:JSON.stringify({sessionId:"abae79",runId:"run1",hypothesisId:"D",location:"sync-status.ts:syncNow",message:"incremental sync failed",data:{offline,error:error instanceof Error?error.message:"unknown"},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    setState({
      offline,
      lastError: offline
        ? "Offline — changes are queued locally."
        : getApiErrorMessage(error, "Sync failed"),
    });
    return false;
  } finally {
    setState({ syncing: false });
    await refreshPendingCount().catch(() => undefined);
  }
}

export function clearSyncError(): void {
  setState({ lastError: null });
}
