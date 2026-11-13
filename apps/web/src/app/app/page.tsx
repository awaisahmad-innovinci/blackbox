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
  formatMoney,
  type OwnerBusinessOverview,
  type Permission,
} from "@blackbox/shared";
import { Button } from "@blackbox/ui/button";
import { Badge } from "@blackbox/ui/badge";
import { useAuth } from "@/components/auth-provider";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import {
  getCurrentTenant,
  getOwnerOverview,
  listDevices,
  listUsers,
  type TenantDto,
} from "@/lib/admin-api";

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

function money(value: number): string {
  return `Rs ${formatMoney(value)}`;
}

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
        <OwnerOverview overview={overview} />
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

function OwnerOverview({ overview }: { overview: OwnerBusinessOverview }) {
  const today = new Date(`${overview.date}T12:00:00`).toLocaleDateString();
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
      label: "Credit payments",
      value: money(overview.creditPayments),
      hint: "Credit taken on posted sales",
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
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {moneyCards.map((card) => (
          <div key={card.label} className="bb-surface px-5 py-4">
            <p className="text-muted-foreground text-xs tracking-wide uppercase">
              {card.label}
            </p>
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
            <p className="text-muted-foreground text-xs tracking-wide uppercase">
              {card.label}
            </p>
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
        </SectionCard>
      </div>
      <SectionCard title="Cash in manager drawers">
        {overview.drawers.filter((drawer) => drawer.balance > 0).length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No cash in manager drawers.
          </p>
        ) : (
          <ul className="divide-y text-base">
            {overview.drawers
              .filter((drawer) => drawer.balance > 0)
              .map((drawer) => (
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
      </SectionCard>
    </div>
  );
}
