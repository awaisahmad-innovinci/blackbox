import { LAST_FULL_PULL_AT_KEY } from "./pull";

export type DataSourceMode = "local" | "api";

/**
 * Prefer SQLite after a successful full Sync; otherwise fall back to the HTTP API.
 */
export async function resolveDataSourceMode(): Promise<DataSourceMode> {
  const localDb = window.blackbox?.localDb;
  if (!localDb?.getStatus || !localDb.getSyncMeta) return "api";
  try {
    const status = await localDb.getStatus();
    if (!status.connected) return "api";
    const lastPull = await localDb.getSyncMeta(LAST_FULL_PULL_AT_KEY);
    return lastPull ? "local" : "api";
  } catch {
    return "api";
  }
}

/** True when the device SQLite database is open (Electron POS). */
export async function isLocalDbConnected(): Promise<boolean> {
  const localDb = window.blackbox?.localDb;
  if (!localDb?.getStatus) return false;
  try {
    const status = await localDb.getStatus();
    return status.connected;
  } catch {
    return false;
  }
}

/**
 * POS catalog reads (search / barcode) use SQLite whenever the local DB is
 * ready — not only after a full cloud pull.
 */
export async function shouldUseLocalCatalog(): Promise<boolean> {
  if (!window.blackbox?.localDb?.searchSkus) return false;
  return isLocalDbConnected();
}
