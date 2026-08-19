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
