import { useCallback, useEffect, useState } from "react";
import type { DashboardSummary, MasterDataImportResult } from "@blackbox/shared";
import { Button } from "@blackbox/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@blackbox/ui/card";
import { Skeleton } from "@blackbox/ui/skeleton";
import { dashboardApi } from "@renderer/lib/api/dashboard";
import { ApiError } from "@renderer/lib/api/client";
import { getAccessToken } from "@renderer/lib/api/session";
import { syncApi } from "@renderer/lib/api/sync";
import {
  bumpDataVersion,
  getSyncStatus,
  syncNow,
  useSyncDataVersion,
} from "@renderer/lib/sync/sync-status";
import {
  resolveDataSourceMode,
  type DataSourceMode,
} from "@renderer/lib/local-db/data-source";
import {
  LAST_FULL_PULL_AT_KEY,
  runFullPull,
  runMasterDataImportPull,
  SyncPullError,
  type SyncProgress,
} from "@renderer/lib/local-db/pull";
import { ImportMasterDataDialog } from "./ImportMasterDataDialog";
import { DeviceSessionCard } from "./DeviceSessionCard";
import {
  KEYBOARD_HINT_APP_NAV,
  KeyboardHints,
} from "@renderer/components/keyboard-hints";

type LocalDbStatus = Awaited<
  ReturnType<NonNullable<NonNullable<Window["blackbox"]>["localDb"]>["getStatus"]>
>;

const CARDS: {
  key: keyof DashboardSummary;
  label: string;
  hint: string;
}[] = [
  { key: "totalProducts", label: "Products", hint: "Catalog products" },
  { key: "totalSkus", label: "SKUs", hint: "Sellable variants" },
  { key: "totalStockLines", label: "Stock lines", hint: "Warehouse stock rows" },
  { key: "lowStockItems", label: "Low stock", hint: "At or below reorder" },
  {
    key: "pendingPurchaseOrders",
    label: "Pending POs",
    hint: "Draft / submitted / partial",
  },
  {
    key: "recentReceipts",
    label: "Recent receipts",
    hint: "Posted in last 30 days",
  },
];

function formatSyncedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function DashboardPage() {
  const dataVersion = useSyncDataVersion();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dataSource, setDataSource] = useState<DataSourceMode>("api");
  const [localDbStatus, setLocalDbStatus] = useState<LocalDbStatus | null>(
    null,
  );
  const [localDbLoading, setLocalDbLoading] = useState(true);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const loadLastSynced = useCallback(async () => {
    const value = await window.blackbox?.localDb?.getSyncMeta?.(
      LAST_FULL_PULL_AT_KEY,
    );
    setLastSyncedAt(value ?? null);
  }, []);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const mode = await resolveDataSourceMode();
      setDataSource(mode);
      if (mode === "local" && window.blackbox?.localDb?.getDashboardSummary) {
        setSummary(await window.blackbox.localDb.getDashboardSummary());
      } else {
        setSummary(await dashboardApi.getSummary());
      }
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to load dashboard");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary, dataVersion]);

  useEffect(() => {
    let cancelled = false;
    setLocalDbLoading(true);

    const probe = window.blackbox?.localDb?.getStatus;
    if (!probe) {
      const inElectron = navigator.userAgent.includes("Electron");
      setLocalDbStatus({
        connected: false,
        path: null,
        error: inElectron
          ? "Local database bridge did not load. Check the dev terminal for a [preload] error."
          : "Browser preview: the local database runs only in the desktop app window.",
      });
      setLocalDbLoading(false);
      return;
    }

    void probe()
      .then(async (status) => {
        if (cancelled) return;
        setLocalDbStatus(status);
        if (status.connected) {
          await loadLastSynced();
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLocalDbStatus({
          connected: false,
          path: null,
          error:
            err instanceof Error
              ? err.message
              : "Failed to read local database status",
        });
      })
      .finally(() => {
        if (!cancelled) setLocalDbLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [loadLastSynced]);

  async function onSync() {
    if (syncing || !localDbStatus?.connected) return;
    setSyncing(true);
    setSyncError(null);
    setSyncProgress({
      phase: "reference",
      done: 0,
      total: 1,
      message: "Starting sync…",
    });
    try {
      const token = getAccessToken();
      if (token) {
        try {
          const status = await syncApi.status();
          setSyncProgress({
            phase: "reference",
            done: 0,
            total: 1,
            message: "Incremental sync…",
          });
          if (!status.needsFullResync && lastSyncedAt) {
            if (!(await syncNow())) {
              throw new Error(
                getSyncStatus().lastError ?? "Incremental sync failed",
              );
            }
            const now = new Date().toISOString();
            await window.blackbox?.localDb?.setSyncMeta(
              LAST_FULL_PULL_AT_KEY,
              now,
            );
            setLastSyncedAt(now);
            setSyncProgress({
              phase: "done",
              done: 1,
              total: 1,
              message: "Incremental sync complete",
            });
            await loadSummary();
            return;
          }
        } catch {
          /* fall through to full pull */
        }
      }
      const result = await runFullPull((progress) => {
        setSyncProgress(progress);
      });
      if (token) {
        try {
          const status = await syncApi.status();
          for (const stream of status.streams) {
            await window.blackbox?.sync?.applyPull({
              changes: [],
              nextCursor: stream.serverSeq,
              stream: stream.stream,
            });
          }
          await syncApi.completeFullResync();
        } catch {
          /* cursors optional until device is trusted */
        }
      }
      setLastSyncedAt(result.lastSyncedAt);
      setSyncProgress({
        phase: "done",
        done: 1,
        total: 1,
        message: "Sync complete",
      });
      bumpDataVersion();
      await loadSummary();
    } catch (err: unknown) {
      if (err instanceof SyncPullError) {
        setSyncError(`${err.phase}: ${err.message}`);
      } else if (err instanceof Error) {
        setSyncError(err.message);
      } else {
        setSyncError("Sync failed");
      }
    } finally {
      setSyncing(false);
    }
  }

  async function onMasterDataImported(imported: MasterDataImportResult) {
    if (!localDbStatus?.connected) {
      await loadSummary();
      throw new Error("Local database is not connected.");
    }
    setSyncing(true);
    setSyncError(null);
    setSyncProgress({
      phase: "reference",
      done: 0,
      total: 1,
      message: "Starting post-import sync…",
    });
    try {
      const result = await runMasterDataImportPull(
        imported.files.map((file) => file.file),
        setSyncProgress,
      );
      setLastSyncedAt(result.lastSyncedAt);
      setSyncProgress({
        phase: "done",
        done: 1,
        total: 1,
        message: "Import Sync complete",
      });
      bumpDataVersion();
      await loadSummary();
    } catch (error: unknown) {
      const message =
        error instanceof SyncPullError
          ? `${error.phase}: ${error.message}`
          : error instanceof Error
            ? error.message
            : "Sync failed";
      setSyncError(message);
      throw new Error(message);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Demo Store inventory overview.
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            {dataSource === "local" ? "Showing local data" : "Showing API data"}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={syncing}
          onClick={() => setImportOpen(true)}
        >
          Upload Old Data
        </Button>
      </div>

      <ImportMasterDataDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={onMasterDataImported}
      />

      <DeviceSessionCard />

      {localDbLoading ? (
        <Skeleton className="h-12 w-full rounded-lg" />
      ) : localDbStatus?.connected ? (
        <div
          role="status"
          className="border-border bg-muted/40 space-y-3 rounded-lg border px-4 py-3 text-sm"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium">Local database connected</p>
              {/* <p className="text-muted-foreground mt-1 break-all text-xs">
                {localDbStatus.path} · {localDbStatus.migrationsApplied}{" "}
                migrations applied
              </p> */}
              <p className="text-muted-foreground mt-1 text-xs">
                {lastSyncedAt
                  ? `Last synced: ${formatSyncedAt(lastSyncedAt)}`
                  : "Not synced yet — pull cloud data into the local database."}
              </p>
              {syncing && syncProgress ? (
                <p className="mt-2 text-xs font-medium">{syncProgress.message}</p>
              ) : null}
            </div>
            <Button
              type="button"
              size="sm"
              disabled={syncing}
              onClick={() => void onSync()}
            >
              {syncing ? "Syncing…" : "Sync"}
            </Button>
          </div>
        </div>
      ) : (
        <div
          role="alert"
          className="border-amber-500/40 bg-amber-500/5 text-amber-900 dark:text-amber-200 rounded-lg border px-4 py-3 text-sm"
        >
          <p className="font-medium">Local database not available</p>
          <p className="mt-1 text-xs opacity-90">
            {localDbStatus && !localDbStatus.connected
              ? localDbStatus.error
              : "Unable to reach the local SQLite database."}
          </p>
        </div>
      )}

      {syncError ? (
        <div
          role="alert"
          className="border-destructive/40 bg-destructive/5 text-destructive rounded-lg border px-4 py-3 text-sm"
        >
          Sync failed — {syncError}
        </div>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="border-destructive/40 bg-destructive/5 text-destructive rounded-lg border px-4 py-3 text-sm"
        >
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CARDS.map((card) => (
          <Card key={card.key} className="gap-3 py-5">
            <CardHeader className="px-5 pb-0">
              <CardTitle className="text-muted-foreground text-sm font-medium">
                {card.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5">
              {loading ? (
                <Skeleton className="h-9 w-16" />
              ) : (
                <p className="text-3xl font-semibold tracking-tight tabular-nums">
                  {summary?.[card.key] ?? "—"}
                </p>
              )}
              <p className="text-muted-foreground mt-1 text-xs">{card.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <KeyboardHints hints={[KEYBOARD_HINT_APP_NAV]} />
    </div>
  );
}
