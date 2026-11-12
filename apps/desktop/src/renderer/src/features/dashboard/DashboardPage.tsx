import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type {
  CashierDashboardSummary,
  DashboardSummary,
  ManagerDashboardSummary,
  MasterDataImportResult,
} from "@blackbox/shared";
import { formatMoney } from "@blackbox/shared";
import { Button } from "@blackbox/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@blackbox/ui/card";
import { Skeleton } from "@blackbox/ui/skeleton";
import { dashboardApi } from "@renderer/lib/api/dashboard";
import { ApiError } from "@renderer/lib/api/client";
import {
  enqueueMasterDataLocalSync,
  useCatalogSync,
} from "@renderer/lib/sync/catalog-sync";
import { useSyncDataVersion } from "@renderer/lib/sync/sync-status";
import {
  resolveDataSourceMode,
  type DataSourceMode,
} from "@renderer/lib/local-db/data-source";
import { useSession } from "@renderer/lib/session/context";
import { useSalesAccess } from "@renderer/lib/use-sales-access";
import { ImportMasterDataDialog } from "./ImportMasterDataDialog";
import {
  KEYBOARD_HINT_APP_NAV,
  KeyboardHints,
} from "@renderer/components/keyboard-hints";

type LocalDbStatus = Awaited<
  ReturnType<NonNullable<NonNullable<Window["blackbox"]>["localDb"]>["getStatus"]>
>;

const MANAGER_CARDS: {
  key: "tillCashCollectedAmount" | "customerReturnCount" | "drawerBalance";
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
    label: "Returns issued (today)",
    hint: "Pending and completed return vouchers today",
    format: "count",
  },
  {
    key: "drawerBalance",
    label: "Drawer balance",
    hint: "Opening float plus collections, minus till floats, expenses, and cash submitted to the owner",
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
    key: "openingBalanceAmount",
    label: "Opening balance (today)",
    hint: "Till float you opened with today",
    format: "money",
  },
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
  {
    key: "refundTotalAmount",
    label: "Refunds paid (today)",
    hint: "Cash refunds you completed today",
    format: "money",
  },
  {
    key: "cashWithdrawnAmount",
    label: "Cash withdrawn (today)",
    hint: "Cash collected from your till today",
    format: "money",
  },
  {
    key: "cashInHandAmount",
    label: "Cash in hand (today)",
    hint: "Opening float plus cash received minus refunds and withdrawals today",
    format: "money",
  },
];

export function DashboardPage() {
  const dataVersion = useSyncDataVersion();
  const { user } = useSession();
  const {
    cashierOnly,
    showManagerDashboard,
    showInventoryDashboard,
    canAccessStockOverview,
  } =
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
  const catalog = useCatalogSync();
  const [importOpen, setImportOpen] = useState(false);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const mode = await resolveDataSourceMode();
      setDataSource(mode);
      const localDb = window.blackbox?.localDb;
      let localDbConnected = false;
      if (localDb?.getStatus) {
        try {
          const status = await localDb.getStatus();
          localDbConnected = status.connected;
        } catch {
          localDbConnected = false;
        }
      }
      if (cashierOnly && user?.id) {
        if (localDbConnected && localDb?.getCashierDashboardSummary) {
          setCashierSummary(
            await localDb.getCashierDashboardSummary(user.id),
          );
        } else {
          setCashierSummary({
            date: new Date().toISOString().slice(0, 10),
            totalSalesAmount: 0,
            nonFbrSalesAmount: 0,
            cashReceivedAmount: 0,
            cardPaymentsAmount: 0,
            heldBillsCount: 0,
            refundTotalAmount: 0,
            openingBalanceAmount: 0,
            cashWithdrawnAmount: 0,
            cashInHandAmount: 0,
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
              await window.blackbox.localDb.getManagerDashboardSummary(
                user.id,
                user.permissions.includes("web.access"),
                user.fullName || user.username,
              ),
            );
          } else {
            try {
              setManagerSummary(await dashboardApi.getManagerSummary());
            } catch {
              setManagerSummary({
                date: new Date().toISOString().slice(0, 10),
                tillCashCollectedAmount: 0,
                customerReturnCount: 0,
                drawerBalance: 0,
                drawers: [],
                cashierTills: [],
                cashSubmittedToday: 0,
                cashSubmissionsToday: [],
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
  }, []);

  function onMasterDataImported(imported: MasterDataImportResult) {
    enqueueMasterDataLocalSync(imported.files.map((file) => file.file));
  }

  const cashierTills = managerSummary?.cashierTills ?? [];
  const isOwner = user?.permissions.includes("web.access") ?? false;
  const uncollectedTillTotal = cashierTills.reduce(
    (sum, till) => sum + till.currentCashBalance,
    0,
  );

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
          {cashierOnly ? (
            <p className="text-muted-foreground mt-1 text-xs">
              {cashierSummary
                ? new Date(`${cashierSummary.date}T12:00:00`).toLocaleDateString()
                : null}
              {cashierSummary ? " · " : ""}
              {localDbStatus?.connected
                ? "Showing local sales data"
                : "Local database unavailable — totals may be incomplete"}
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

      {!localDbLoading && localDbStatus && !localDbStatus.connected ? (
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
          {localDbStatus?.path ? (
            <p className="mt-2 break-all font-mono text-xs opacity-90">
              Expected file: {localDbStatus.path}
            </p>
          ) : null}
        </div>
      ) : null}

      {catalog.error ? (
        <div
          role="alert"
          className="border-destructive/40 bg-destructive/5 text-destructive rounded-lg border px-4 py-3 text-sm"
        >
          Sync failed — {catalog.error}
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
        <div className="space-y-4">
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
                      ? `Rs ${formatMoney(Number(cashierSummary?.[card.key] ?? 0))}`
                      : (cashierSummary?.[card.key] ?? "—")}
                  </p>
                )}
                <p className="text-muted-foreground mt-1 text-xs">{card.hint}</p>
              </CardContent>
            </Card>
          ))}
        </div>
        <Button variant="outline" asChild>
          <Link to="/sales/till">Open till</Link>
        </Button>
        </div>
      ) : (
        <div className="space-y-8">
          {showManagerDashboard ? (
            <div className="space-y-4">
              {isOwner ? null : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
                            ? `Rs ${formatMoney(Number(managerSummary?.[card.key] ?? 0))}`
                            : (managerSummary?.[card.key] ?? "—")}
                        </p>
                      )}
                      <p className="text-muted-foreground mt-1 text-xs">
                        {card.key === "drawerBalance"
                          ? (() => {
                              const own = managerSummary?.drawers.find(
                                (drawer) => drawer.managerUserId === user?.id,
                              );
                              if (!own) return card.hint;
                              return `Opening ${formatMoney(own.openingFloat)} · Collected ${formatMoney(own.collected)} · Till floats ${formatMoney(own.tillFloats)} · Expenses ${formatMoney(own.expenses)} · Submitted ${formatMoney(own.submitted)}`;
                            })()
                          : card.hint}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
              )}
              {isOwner ? null : (
              <Card className="gap-3 py-5">
                <CardHeader className="px-5 pb-0">
                  <CardTitle className="text-sm font-medium">
                    Cash still in tills
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-5">
                  {loading ? (
                    <Skeleton className="h-8 w-full" />
                  ) : cashierTills.length === 0 ? (
                    <p className="text-muted-foreground text-sm">
                      No uncollected till cash.
                    </p>
                  ) : (
                    <ul className="divide-y text-sm">
                      {cashierTills.map((till) => (
                        <li
                          key={`${till.userId}-${till.tillName}-${till.status}`}
                          className="flex items-center justify-between gap-4 py-2"
                        >
                          <span>
                            {till.userName}
                            <span className="text-muted-foreground">
                              {" "}
                              · {till.tillName}
                            </span>
                          </span>
                          <span className="tabular-nums">
                            Rs {formatMoney(till.currentCashBalance)}
                          </span>
                        </li>
                      ))}
                      <li className="flex items-center justify-between gap-4 py-2 font-medium">
                        <span>Total not collected</span>
                        <span className="tabular-nums">
                          Rs {formatMoney(uncollectedTillTotal)}
                        </span>
                      </li>
                    </ul>
                  )}
                </CardContent>
              </Card>
              )}
              {isOwner ? (
                <div className="grid gap-4 lg:grid-cols-2">
                <Card className="gap-3 py-5">
                  <CardHeader className="px-5 pb-0">
                    <CardTitle className="text-sm font-medium">
                      Cash collected
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-5">
                    {loading ? (
                      <Skeleton className="h-8 w-full" />
                    ) : (
                      <>
                        <p className="text-3xl font-semibold tracking-tight tabular-nums">
                          Rs {formatMoney(managerSummary?.cashSubmittedToday ?? 0)}
                        </p>
                        <p className="text-muted-foreground mt-1 text-xs">
                          Cash managers handed over today
                        </p>
                        {(managerSummary?.cashSubmissionsToday.length ?? 0) > 0 ? (
                          <ul className="mt-3 divide-y text-sm">
                            {managerSummary?.cashSubmissionsToday.map((row) => (
                              <li
                                key={row.managerUserId}
                                className="flex items-center justify-between gap-4 py-2"
                              >
                                <span>{row.managerName}</span>
                                <span className="tabular-nums">
                                  Rs {formatMoney(row.amount)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-muted-foreground mt-3 text-sm">
                            No cash submitted today.
                          </p>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>
                <Card className="gap-3 py-5">
                  <CardHeader className="px-5 pb-0">
                    <CardTitle className="text-sm font-medium">
                      Cash in manager drawers
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-5">
                    {loading ? (
                      <Skeleton className="h-8 w-full" />
                    ) : (managerSummary?.drawers.length ?? 0) === 0 ? (
                      <p className="text-muted-foreground text-sm">
                        No cash in manager drawers.
                      </p>
                    ) : (
                      <ul className="divide-y text-sm">
                        {managerSummary?.drawers.map((drawer) => (
                          <li
                            key={drawer.managerUserId}
                            className="flex items-start justify-between gap-4 py-2"
                          >
                            <span>
                              {drawer.managerName}
                              <span className="text-muted-foreground block text-xs">
                                Opening {formatMoney(drawer.openingFloat)} · Collected{" "}
                                {formatMoney(drawer.collected)} · Till floats{" "}
                                {formatMoney(drawer.tillFloats)} · Expenses{" "}
                                {formatMoney(drawer.expenses)} · Submitted{" "}
                                {formatMoney(drawer.submitted)}
                              </span>
                            </span>
                            <span className="tabular-nums">
                              Rs {formatMoney(drawer.balance)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {isOwner ? (
                  <Button variant="outline" asChild>
                    <Link to="/cash-flow">Fund drawers</Link>
                  </Button>
                ) : (
                  <Button variant="outline" asChild>
                    <Link to="/cash-flow">Cash flow</Link>
                  </Button>
                )}
                <Button variant="outline" asChild>
                  <Link to="/sales/stock-overview">View floor &amp; warehouse stock</Link>
                </Button>
              </div>
            </div>
          ) : null}

          {showInventoryDashboard ? (
            <div className="space-y-4">
              {canAccessStockOverview && !showManagerDashboard ? (
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" asChild>
                    <Link to="/sales/stock-overview">
                      Floor &amp; warehouse stock
                    </Link>
                  </Button>
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
                    <p className="text-muted-foreground mt-1 text-xs">
                      {card.hint}
                    </p>
                  </CardContent>
                </Card>
              ))}
              </div>
            </div>
          ) : null}
        </div>
      )}

      <KeyboardHints hints={[KEYBOARD_HINT_APP_NAV]} />
    </div>
  );
}
