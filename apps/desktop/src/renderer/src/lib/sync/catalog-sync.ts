import { useSyncExternalStore } from "react";
import { syncApi } from "@renderer/lib/api/sync";
import {
  CATALOG_PULL_ACTIVE_KEY,
  LAST_FULL_PULL_AT_KEY,
  runFullPull,
  runMasterDataImportPull,
  SyncPullError,
} from "@renderer/lib/local-db/pull";
import { bumpDataVersion } from "./sync-status";

export type CatalogSyncState = {
  active: boolean;
  message: string | null;
  error: string | null;
  finishedAt: number | null;
};

let state: CatalogSyncState = {
  active: false,
  message: null,
  error: null,
  finishedAt: null,
};

const listeners = new Set<() => void>();
let tail: Promise<void> = Promise.resolve();
let catalogRunning = false;

function enqueue(job: () => Promise<void>): void {
  tail = tail.then(job, job);
}

function setState(patch: Partial<CatalogSyncState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useCatalogSync(): CatalogSyncState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

/**
 * Downloads the cloud catalog in the background when this device has never
 * finished a pull, was flagged for a full resync, or its local product count
 * is behind the cloud. A restart continues from the last saved page.
 */
export function maybeStartCatalogSync(): void {
  if (catalogRunning) return;
  catalogRunning = true;
  enqueue(async () => {
    try {
      await runCatalogSync();
    } finally {
      catalogRunning = false;
    }
  });
}

/** Rebuilds the local database from the cloud after a revoke wiped it. */
export function startForcedFullSync(): Promise<void> {
  return new Promise((resolve, reject) => {
    enqueue(async () => {
      setState({
        active: true,
        error: null,
        message: "Restoring this device…",
      });
      try {
        const localDb = window.blackbox?.localDb;
        await localDb?.setSyncMeta?.(CATALOG_PULL_ACTIVE_KEY, "1");
        await runFullPull((progress) => {
          setState({ active: true, error: null, message: progress.message });
        });
        await localDb?.setSyncMeta?.(CATALOG_PULL_ACTIVE_KEY, "0");
        bumpDataVersion();
        setState({
          active: false,
          error: null,
          message: null,
          finishedAt: Date.now(),
        });
        resolve();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Restore failed";
        setState({ active: false, error: message, message: null });
        reject(err instanceof Error ? err : new Error(message));
      }
    });
  });
}

/** Pull the imported files into SQLite after the current catalog or import sync. */
export function enqueueMasterDataLocalSync(files: string[]): void {
  if (files.length === 0) return;
  enqueue(async () => {
    setState({
      active: true,
      error: null,
      message: "Syncing imported data…",
    });
    try {
      await runMasterDataImportPull(files, (progress) => {
        setState({ active: true, error: null, message: progress.message });
      });
      bumpDataVersion();
      setState({
        active: false,
        error: null,
        message: null,
        finishedAt: Date.now(),
      });
    } catch (err: unknown) {
      const message =
        err instanceof SyncPullError
          ? `${err.phase}: ${err.message}`
          : err instanceof Error
            ? err.message
            : "Import sync failed";
      setState({ active: false, error: message, message: null });
    }
  });
}

async function runCatalogSync(): Promise<void> {
  const localDb = window.blackbox?.localDb;
  if (!localDb?.getSyncMeta || !localDb.setSyncMeta || !localDb.listProducts) {
    return;
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;

  try {
    const connected = await localDb.getStatus?.();
    if (connected && connected.connected === false) return;
  } catch {
    return;
  }

  let needsFullResync = false;
  try {
    const status = await syncApi.status();
    needsFullResync = status.needsFullResync;
  } catch {
    return;
  }

  const active = await localDb.getSyncMeta(CATALOG_PULL_ACTIVE_KEY);
  const lastPull = await localDb.getSyncMeta(LAST_FULL_PULL_AT_KEY);
  const interrupted = active === "1";

  let behind = false;
  if (!interrupted) {
    try {
      const [local, cloud] = await Promise.all([
        localDb.listProducts({ page: 1, pageSize: 1 }),
        syncApi.catalogProducts(1, 1),
      ]);
      behind = local.total < cloud.total;
    } catch {
      behind = !lastPull;
    }
  }

  if (!interrupted && lastPull && !needsFullResync && !behind) return;

  setState({ active: true, error: null, message: "Updating catalog…" });
  await localDb.setSyncMeta(CATALOG_PULL_ACTIVE_KEY, "1");
  try {
    await runFullPull(
      (progress) => {
        setState({ active: true, error: null, message: progress.message });
      },
      { resume: interrupted },
    );
    await localDb.setSyncMeta(CATALOG_PULL_ACTIVE_KEY, "0");
    bumpDataVersion();
    setState({
      active: false,
      error: null,
      message: null,
      finishedAt: Date.now(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Catalog sync failed";
    setState({ active: false, error: message, message: null });
  }
}
