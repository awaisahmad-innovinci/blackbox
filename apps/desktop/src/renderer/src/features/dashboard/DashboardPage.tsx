import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type {
  CashierDashboardSummary,
  DashboardSummary,
  ManagerDashboardSummary,
  MasterDataImportResult,
} from "@blackbox/shared";
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
import { useSession } from "@renderer/lib/session/context";
import { useSalesAccess } from "@renderer/lib/use-sales-access";
import { ImportMasterDataDialog } from "./ImportMasterDataDialog";
import { DeviceSessionCard } from "./DeviceSessionCard";
import {
  KEYBOARD_HINT_APP_NAV,
  KeyboardHints,
} from "@renderer/components/keyboard-hints";

type LocalDbStatus = Awaited<
  ReturnType<NonNullable<NonNullable<Window["blackbox"]>["localDb"]>["getStatus"]>
>;

const MANAGER_CARDS: {
  key: keyof ManagerDashboardSummary;
  label: string;
  hint: string;
  format: "money" | "count";
}[] = [
  {
    key: "tillCashCollectedAmount",
    label: "Till cash collected (today)",
    hint: "Cash you collected from tills today",
    format: "money",
  },
  {
    key: "customerReturnCount",
    label: "Customer returns (today)",
    hint: "Posted returns for the store today",
    format: "count",
  },
  {
    key: "refundTotalAmount",
    label: "Refunds issued (today)",
    hint: "Refund amount you processed today",
    format: "money",
  },
  {
    key: "netAfterRefundsAmount",
    label: "Net after refunds",
    hint: "Till cash collected minus refunds you issued",
    format: "money",
  },
];

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

const CASHIER_CARDS: {
  key: keyof CashierDashboardSummary;
  label: string;
  hint: string;
  format: "money" | "count";
}[] = [
  {
    key: "totalSalesAmount",
    label: "Total sales (today)",
    hint: "Posted sales total for today",
    format: "money",
  },
  {
    key: "cashReceivedAmount",
    label: "Cash received (today)",
    hint: "Cash payments posted today",
    format: "money",
  },
  {
    key: "cardPaymentsAmount",
    label: "Card payments (today)",
    hint: "Card payments posted today",
    format: "money",
  },
  {
    key: "heldBillsCount",
    label: "Held bills",
    hint: "Your held bills on this device",
    format: "count",
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
  const { user } = useSession();
  const { cashierOnly, showManagerDashboard, showInventoryDashboard } =
    useSalesAccess();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [cashierSummary, setCashierSummary] =
    useState<CashierDashboardSummary | null>(null);
  const [managerSummary, setManagerSummary] =
    useState<ManagerDashboardSummary | null>(null);
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
      if (cashierOnly && user?.id) {
        if (
          mode === "local" &&
          window.blackbox?.localDb?.getCashierDashboardSummary
        ) {
          setCashierSummary(
            await window.blackbox.localDb.getCashierDashboardSummary(user.id),
          );
        } else {
          setCashierSummary({
            date: new Date().toISOString().slice(0, 10),
            totalSalesAmount: 0,
            cashReceivedAmount: 0,
            cardPaymentsAmount: 0,
            heldBillsCount: 0,
          });
        }
        setSummary(null);
        setManagerSummary(null);
      } else {
        setCashierSummary(null);

        if (showManagerDashboard && user?.id) {
          if (
            mode === "local" &&
            window.blackbox?.localDb?.getManagerDashboardSummary
          ) {
            setManagerSummary(
              await window.blackbox.localDb.getManagerDashboardSummary(user.id),
            );
          } else {
            try {
              setManagerSummary(await dashboardApi.getManagerSummary());
            } catch {
              setManagerSummary({
                date: new Date().toISOString().slice(0, 10),
                tillCashCollectedAmount: 0,
                customerReturnCount: 0,
                refundTotalAmount: 0,
                netAfterRefundsAmount: 0,
              });
            }
          }
        } else {
          setManagerSummary(null);
        }

        if (showInventoryDashboard) {
          if (mode === "local" && window.blackbox?.localDb?.getDashboardSummary) {
            setSummary(await window.blackbox.localDb.getDashboardSummary());
          } else {
            setSummary(await dashboardApi.getSummary());
          }
        } else {
          setSummary(null);
        }
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
  }, [cashierOnly, showInventoryDashboard, showManagerDashboard, user?.id]);

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
            {cashierOnly
              ? "Today's sales summary."
              : showManagerDashboard && showInventoryDashboard
                ? "Today's till summary and inventory overview."
                : showManagerDashboard
                  ? "Today's till and refund summary."
                  : "Inventory overview."}
          </p>
          {cashierOnly && cashierSummary ? (
            <p className="text-muted-foreground mt-1 text-xs">
              {new Date(`${cashierSummary.date}T12:00:00`).toLocaleDateString()}
            </p>
          ) : showManagerDashboard && managerSummary ? (
            <p className="text-muted-foreground mt-1 text-xs">
              {new Date(`${managerSummary.date}T12:00:00`).toLocaleDateString()}
            </p>
          ) : !cashierOnly ? (
            <p className="text-muted-foreground mt-1 text-xs">
              {dataSource === "local" ? "Showing local data" : "Showing API data"}
            </p>
          ) : null}
        </div>
        {showInventoryDashboard && !cashierOnly ? (
          <Button
            type="button"
            variant="outline"
            disabled={syncing}
            onClick={() => setImportOpen(true)}
          >
            Upload Old Data
          </Button>
        ) : null}
      </div>

      {!cashierOnly && showInventoryDashboard ? (
        <ImportMasterDataDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          onImported={onMasterDataImported}
        />
      ) : null}

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

      {cashierOnly ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CASHIER_CARDS.map((card) => (
            <Card key={card.key} className="gap-3 py-5">
              <CardHeader className="px-5 pb-0">
                <CardTitle className="text-muted-foreground text-sm font-medium">
                  {card.label}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5">
                {loading ? (
                  <Skeleton className="h-9 w-24" />
                ) : (
                  <p className="text-3xl font-semibold tracking-tight tabular-nums">
                    {card.format === "money"
                      ? `Rs ${(cashierSummary?.[card.key] ?? 0).toLocaleString()}`
                      : (cashierSummary?.[card.key] ?? "—")}
                  </p>
                )}
                <p className="text-muted-foreground mt-1 text-xs">{card.hint}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-8">
          {showManagerDashboard ? (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {MANAGER_CARDS.map((card) => (
                  <Card key={card.key} className="gap-3 py-5">
                    <CardHeader className="px-5 pb-0">
                      <CardTitle className="text-muted-foreground text-sm font-medium">
                        {card.label}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-5">
                      {loading ? (
                        <Skeleton className="h-9 w-24" />
                      ) : (
                        <p className="text-3xl font-semibold tracking-tight tabular-nums">
                          {card.format === "money"
                            ? `Rs ${(managerSummary?.[card.key] ?? 0).toLocaleString()}`
                            : (managerSummary?.[card.key] ?? "—")}
                        </p>
                      )}
                      <p className="text-muted-foreground mt-1 text-xs">
                        {card.hint}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <Button variant="outline" asChild>
                <Link to="/sales/stock-overview">View floor &amp; warehouse stock</Link>
              </Button>
            </div>
          ) : null}

          {showInventoryDashboard ? (
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
                    <p className="text-muted-foreground mt-1 text-xs">
                      {card.hint}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : null}
        </div>
      )}

      <KeyboardHints hints={[KEYBOARD_HINT_APP_NAV]} />
    </div>
  );
}
