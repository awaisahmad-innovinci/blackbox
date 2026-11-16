"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Users,
  MonitorSmartphone,
  Settings,
  ArrowRight,
  Warehouse,
  Loader2,
} from "lucide-react";
import {
  CASH_EXPENSE_CATEGORIES,
  expenseExceedsDrawer,
  expenseOverDrawerMessage,
  type CashExpenseCategory,
  type OwnerBusinessOverview,
  type Permission,
} from "@blackbox/shared";
import { Button } from "@blackbox/ui/button";
import { Badge } from "@blackbox/ui/badge";
import { Input } from "@blackbox/ui/input";
import { useAuth } from "@/components/auth-provider";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import {
  getCurrentTenant,
  getOwnerOverview,
  fundManagerDrawer,
  listDrawerManagers,
  listDevices,
  listUsers,
  recordCashExpense,
  recordOwnerCash,
  type DrawerManager,
  type TenantDto,
} from "@/lib/admin-api";
import { useCurrency } from "@/lib/use-currency";
import { MoneyInput } from "@blackbox/ui/money-input";
import { ConfirmDialog } from "@blackbox/ui/confirm-dialog";
import { NativeSelect } from "@blackbox/ui/native-select";

type Counts = {
  users: number | null;
  devices: number | null;
};

const QUICK: {
  href: string;
  label: string;
  description: string;
  permission: Permission;
  icon: typeof Users;
}[] = [
  {
    href: "/app/users",
    label: "Users",
    description: "Invite people and assign roles",
    permission: "users.read",
    icon: Users,
  },
  {
    href: "/app/devices",
    label: "Devices",
    description: "Review trusted desktops",
    permission: "devices.read",
    icon: MonitorSmartphone,
  },
  {
    href: "/app/warehouses",
    label: "Warehouses",
    description: "Create and deactivate locations",
    permission: "warehouses.write",
    icon: Warehouse,
  },
  {
    href: "/app/settings",
    label: "Settings",
    description: "Workspace business name",
    permission: "tenant.settings.read",
    icon: Settings,
  },
];


export default function DashboardPage() {
  const { user, hasPermission } = useAuth();
  const [tenant, setTenant] = useState<TenantDto | null>(null);
  const [counts, setCounts] = useState<Counts>({
    users: null,
    devices: null,
  });
  const [overview, setOverview] = useState<OwnerBusinessOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next: Counts = { users: null, devices: null };
      if (hasPermission("tenant.settings.read")) {
        try {
          const t = await getCurrentTenant();
          if (!cancelled) setTenant(t);
        } catch {
          /* ignore — dashboard still useful */
        }
      }
      if (hasPermission("users.read")) {
        try {
          const users = await listUsers();
          next.users = users.length;
        } catch {
          next.users = null;
        }
      }
      if (hasPermission("devices.read")) {
        try {
          const devices = await listDevices();
          next.devices = devices.length;
        } catch {
          next.devices = null;
        }
      }
      if (!cancelled) setCounts(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [hasPermission]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setOverviewLoading(true);
      setOverviewError(null);
      try {
        const next = await getOwnerOverview();
        if (!cancelled) setOverview(next);
      } catch (err) {
        if (!cancelled) {
          setOverview(null);
          setOverviewError(
            err instanceof Error
              ? err.message
              : "Could not load today's overview.",
          );
        }
      } finally {
        if (!cancelled) setOverviewLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function refreshOverview() {
    const next = await getOwnerOverview();
    setOverview(next);
    setOverviewError(null);
  }

  const actions = QUICK.filter((item) => hasPermission(item.permission));

  return (
    <div className="bb-page">
      <PageHeader
        title="Dashboard"
        // description="Today's sales, cash, and stock for this workspace."
      />

      {overviewError ? (
        <p className="text-destructive text-sm" role="alert">
          {overviewError}
        </p>
      ) : null}

      {overviewLoading ? (
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Loading today&apos;s overview…
        </p>
      ) : overview ? (
        <OwnerOverview overview={overview} onChanged={refreshOverview} />
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <SectionCard title="Workspace" className="md:col-span-2 xl:col-span-2">
          <div className="space-y-3">
            <div>
              <p className="text-muted-foreground text-xs tracking-wide uppercase">
                Business
              </p>
              <p className="font-display mt-1 text-xl font-semibold tracking-tight">
                {tenant?.name ?? "Your workspace"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {tenant ? (
                <Badge variant={tenant.isActive ? "success" : "outline"}>
                  {tenant.isActive ? "Active" : "Inactive"}
                </Badge>
              ) : null}
              {tenant?.businessType ? (
                <Badge variant="secondary">{tenant.businessType}</Badge>
              ) : null}
              {tenant?.country ? (
                <Badge variant="outline">{tenant.country}</Badge>
              ) : null}
              {tenant?.currency ? (
                <Badge variant="outline">{tenant.currency}</Badge>
              ) : null}
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Signed in as">
          <div className="space-y-1">
            <p className="font-medium">{user?.fullName}</p>
            <p className="text-muted-foreground text-sm">{user?.email}</p>
            <p className="text-muted-foreground font-mono text-xs">
              @{user?.username}
            </p>
            <p className="text-muted-foreground pt-2 text-xs">
              {user?.permissions.length ?? 0} effective permissions
            </p>
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Users", value: counts.users, show: hasPermission("users.read") },
          {
            label: "Devices",
            value: counts.devices,
            show: hasPermission("devices.read"),
          },
        ]
          .filter((c) => c.show)
          .map((c) => (
            <div key={c.label} className="bb-surface px-5 py-4">
              <p className="text-muted-foreground text-xs tracking-wide uppercase">
                {c.label}
              </p>
              <p className="font-display mt-1 text-3xl font-semibold tracking-tight">
                {c.value ?? "—"}
              </p>
            </div>
          ))}
      </div>

      <SectionCard
        title="Administration"
        description="Jump to a section you can manage with your current permissions."
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {actions.map((item) => {
            const Icon = item.icon;
            return (
              <Button
                key={item.href}
                asChild
                variant="outline"
                className="h-auto justify-start gap-3 px-4 py-3 text-left"
              >
                <Link href={item.href}>
                  <span className="bg-muted flex size-9 items-center justify-center rounded-lg">
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{item.label}</span>
                    <span className="text-muted-foreground block text-xs font-normal">
                      {item.description}
                    </span>
                  </span>
                  <ArrowRight className="text-muted-foreground size-4 shrink-0" />
                </Link>
              </Button>
            );
          })}
        </div>
      </SectionCard>
    </div>
  );
}

function OwnerOverview({
  overview,
  onChanged,
}: {
  overview: OwnerBusinessOverview;
  onChanged: () => Promise<void>;
}) {
  const today = new Date(`${overview.date}T12:00:00`).toLocaleDateString();
  const { money, currency } = useCurrency();
  const currencyPrefix = !currency || currency === "PKR" ? "Rs" : currency;
  // Money moves only after the owner confirms the amount (review W14).
  const [pendingMove, setPendingMove] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    run: () => void;
  } | null>(null);
  const [cashAmount, setCashAmount] = useState("");
  const [cashSaving, setCashSaving] = useState(false);
  const [cashError, setCashError] = useState<string | null>(null);
  const [managers, setManagers] = useState<DrawerManager[]>([]);
  const [managerId, setManagerId] = useState("");
  const [fundAmount, setFundAmount] = useState("");
  const [fundSaving, setFundSaving] = useState(false);
  const [fundError, setFundError] = useState<string | null>(null);
  const [expenseCategory, setExpenseCategory] =
    useState<CashExpenseCategory>("Rent");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseNote, setExpenseNote] = useState("");
  const [expenseSaving, setExpenseSaving] = useState(false);
  const [expenseError, setExpenseError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listDrawerManagers()
      .then((rows) => {
        if (cancelled) return;
        setManagers(rows);
        setManagerId((current) => current || rows[0]?.id || "");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setFundError(
          err instanceof Error ? err.message : "Could not load managers",
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const moneyCards = [
    {
      label: "Sales",
      value: money(overview.salesTotal),
      hint: `${overview.salesCount} posted ${overview.salesCount === 1 ? "bill" : "bills"}`,
    },
    {
      label: "Cash payments",
      value: money(overview.cashPayments),
      hint: "Cash taken on posted sales",
    },
    {
      label: "Card payments",
      value: money(overview.cardPayments),
      hint: "Card taken on posted sales",
    },
    {
      label: "Refunds",
      value: money(overview.refundTotal),
      hint: `${overview.refundCount} completed ${overview.refundCount === 1 ? "return" : "returns"}`,
    },
  ];
  const inventoryCards = [
    { label: "Products", value: overview.productCount },
    { label: "Low stock", value: overview.lowStockCount },
    { label: "Pending purchase orders", value: overview.pendingPurchaseOrderCount },
  ];

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        {today}. Sales appear here after the desktop syncs them.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {moneyCards.map((card) => (
          <div key={card.label} className="bb-surface px-5 py-4">
            <p className="text-muted-foreground text-sm">{card.label}</p>
            <p className="font-display mt-1 text-2xl font-semibold tracking-tight tabular-nums">
              {card.value}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">{card.hint}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {inventoryCards.map((card) => (
          <div key={card.label} className="bb-surface px-5 py-4">
            <p className="text-muted-foreground text-sm">{card.label}</p>
            <p className="font-display mt-1 text-3xl font-semibold tracking-tight tabular-nums">
              {card.value}
            </p>
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Cash in cashier tills">
          {overview.cashierTills.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No cash in cashier tills.
            </p>
          ) : (
            <ul className="divide-y text-sm">
              {overview.cashierTills.map((till) => (
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
                    {money(till.currentCashBalance)}
                  </span>
                </li>
              ))}
              <li className="flex items-center justify-between gap-4 py-2 font-medium">
                <span>Current balance</span>
                <span className="tabular-nums">{money(overview.tillCashTotal)}</span>
              </li>
            </ul>
          )}
        </SectionCard>
        <SectionCard
          title="Cash collected"
          description="Cash on hand. It stays until the owner spends it on expenses or manager drawers."
        >
          <p className="font-display text-3xl font-semibold tracking-tight tabular-nums">
            {money(overview.ownerCashBalance)}
          </p>
          <form
            className="mt-4 flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const amount = Number(cashAmount);
              if (!(amount > 0) || cashSaving) return;
              setPendingMove({
                title: `Add ${money(amount)} to cash collected?`,
                description: "This records cash the owner has on hand.",
                confirmLabel: "Add cash",
                run: () => {
                  setCashSaving(true);
                  setCashError(null);
                  void recordOwnerCash(amount)
                    .then(() => onChanged())
                    .then(() => setCashAmount(""))
                    .catch((err: unknown) => {
                      setCashError(
                        err instanceof Error ? err.message : "Could not add the cash",
                      );
                    })
                    .finally(() => setCashSaving(false));
                },
              });
            }}
          >
            <MoneyInput
              placeholder="Amount"
              prefix={currencyPrefix}
              value={cashAmount}
              onValueChange={setCashAmount}
              aria-label="Cash to add"
            />
            <Button type="submit" disabled={cashSaving || !(Number(cashAmount) > 0)}>
              {cashSaving ? "Adding…" : "Add"}
            </Button>
          </form>
          {cashError ? (
            <p className="text-destructive mt-2 text-sm" role="alert">
              {cashError}
            </p>
          ) : null}
        </SectionCard>
      </div>
      <SectionCard title="Cash in manager drawers">
        {overview.drawers.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No cash in manager drawers.
          </p>
        ) : (
          <ul className="divide-y text-base">
            {overview.drawers.map((drawer) => (
              <li
                key={drawer.managerUserId}
                className="flex items-center justify-between gap-4 py-2.5"
              >
                <span className="font-medium">{drawer.managerName}</span>
                <span className="text-lg font-bold tabular-nums">
                  {money(drawer.balance)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <form
          className="mt-4 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            const amount = Number(fundAmount);
            if (!managerId || !(amount > 0) || fundSaving) return;
            const manager = managers.find((m) => m.id === managerId);
            setPendingMove({
              title: `Give ${money(amount)} to ${manager?.fullName.trim() || manager?.username || "this manager"}?`,
              description: "The amount moves from cash collected into the manager drawer.",
              confirmLabel: "Fund drawer",
              run: () => {
                setFundSaving(true);
                setFundError(null);
                void fundManagerDrawer(managerId, amount)
                  .then(() => onChanged())
                  .then(() => setFundAmount(""))
                  .catch((err: unknown) => {
                    setFundError(
                      err instanceof Error ? err.message : "Could not fund the drawer",
                    );
                  })
                  .finally(() => setFundSaving(false));
              },
            });
          }}
        >
          <p className="text-sm font-medium">Fund a manager drawer</p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="grid gap-1 text-sm">
              Manager
              <NativeSelect
                value={managerId}
                onChange={(event) => setManagerId(event.target.value)}
                aria-label="Manager"
              >
                {managers.length === 0 ? (
                  <option value="">No managers</option>
                ) : null}
                {managers.map((manager) => (
                  <option key={manager.id} value={manager.id}>
                    {manager.fullName.trim() || manager.username}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <label className="grid gap-1 text-sm">
              Amount
              <MoneyInput
                className="w-40"
                prefix={currencyPrefix}
                value={fundAmount}
                onValueChange={setFundAmount}
                aria-label="Amount to fund"
              />
            </label>
            <Button
              type="submit"
              disabled={fundSaving || !managerId || !(Number(fundAmount) > 0)}
            >
              {fundSaving ? "Saving…" : "Fund drawer"}
            </Button>
          </div>
          {fundError ? (
            <p className="text-destructive text-sm" role="alert">
              {fundError}
            </p>
          ) : null}
        </form>
      </SectionCard>
      <SectionCard
        title="Expenses"
        description="This expense is deducted from the owner drawer."
      >
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const amount = Number(expenseAmount);
            if (!(amount > 0) || expenseSaving) return;
            if (expenseExceedsDrawer(amount, overview.ownerCashBalance)) {
              setExpenseError(expenseOverDrawerMessage(overview.ownerCashBalance));
              return;
            }
            setPendingMove({
              title: `Record a ${money(amount)} ${expenseCategory.toLowerCase()} expense?`,
              description: "The amount is taken out of cash collected.",
              confirmLabel: "Record expense",
              run: () => {
                setExpenseSaving(true);
                setExpenseError(null);
                void recordCashExpense({
                  category: expenseCategory,
                  amount,
                  note: expenseNote.trim() || undefined,
                })
                  .then(() => onChanged())
                  .then(() => {
                    setExpenseAmount("");
                    setExpenseNote("");
                  })
                  .catch((err: unknown) => {
                    setExpenseError(
                      err instanceof Error
                        ? err.message
                        : "Could not record the expense",
                    );
                  })
                  .finally(() => setExpenseSaving(false));
              },
            });
          }}
        >
          <label className="grid gap-1 text-sm">
            Category
            <NativeSelect
              value={expenseCategory}
              onChange={(event) =>
                setExpenseCategory(event.target.value as CashExpenseCategory)
              }
              aria-label="Expense category"
            >
              {CASH_EXPENSE_CATEGORIES.filter(
                (item) => item !== "Vendor payment",
              ).map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label className="grid gap-1 text-sm">
            Amount
            <MoneyInput
              className="w-40"
              prefix={currencyPrefix}
              value={expenseAmount}
              onValueChange={setExpenseAmount}
              aria-label="Expense amount"
            />
          </label>
          <label className="grid gap-1 text-sm">
            Note
            <Input
              className="w-56"
              value={expenseNote}
              onChange={(event) => setExpenseNote(event.target.value)}
              aria-label="Expense note"
            />
          </label>
          <Button
            type="submit"
            disabled={expenseSaving || !(Number(expenseAmount) > 0)}
          >
            {expenseSaving ? "Saving…" : "Add expense"}
          </Button>
          {expenseError ? (
            <p className="text-destructive w-full text-sm" role="alert">
              {expenseError}
            </p>
          ) : (
            <p className="text-muted-foreground w-full text-xs">
              Maximum {money(overview.ownerCashBalance)}.
            </p>
          )}
        </form>
      </SectionCard>
      <ConfirmDialog
        open={pendingMove != null}
        onOpenChange={(open) => {
          if (!open) setPendingMove(null);
        }}
        title={pendingMove?.title ?? ""}
        description={pendingMove?.description ?? ""}
        confirmLabel={pendingMove?.confirmLabel ?? "Confirm"}
        onConfirm={() => {
          pendingMove?.run();
          setPendingMove(null);
        }}
      />
    </div>
  );
}
