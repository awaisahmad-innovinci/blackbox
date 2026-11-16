"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { Permission } from "@blackbox/shared";
import {
  LayoutDashboard,
  Users,
  MonitorSmartphone,
  Settings,
  LogOut,
  Menu,
  BarChart3,
  Warehouse,
  ScrollText,
  Receipt,
  Wallet,
  ShieldCheck,
  KeyRound,
} from "lucide-react";
import { Button } from "@blackbox/ui/button";
import { ConfirmDialog } from "@blackbox/ui/confirm-dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@blackbox/ui/sheet";
import { ThemeToggle } from "@blackbox/ui/theme-toggle";
import { cn } from "@blackbox/ui/lib/utils";
import { useAuth } from "@/components/auth-provider";
import { getCurrentTenant } from "@/lib/admin-api";

type NavItem = {
  href: string;
  label: string;
  permission: Permission | null;
  icon: typeof LayoutDashboard;
};

/** Grouped by what the owner is trying to do, not by system module. */
const NAV_GROUPS: { label: string | null; items: NavItem[] }[] = [
  {
    label: null,
    items: [{ href: "/app", label: "Dashboard", permission: null, icon: LayoutDashboard }],
  },
  {
    label: "Money and stock",
    items: [
      { href: "/app/vendors/payments", label: "Vendor payments", permission: "vendors.access", icon: Wallet },
      { href: "/app/inventory/reports", label: "Inventory report", permission: "inventory.access", icon: BarChart3 },
      { href: "/app/reports/taxes", label: "Tax report", permission: "tax.reports.read", icon: Receipt },
      { href: "/app/warehouses", label: "Warehouses", permission: "warehouses.read", icon: Warehouse },
    ],
  },
  {
    label: "People and devices",
    items: [
      { href: "/app/users", label: "Users", permission: "users.read", icon: Users },
      { href: "/app/roles", label: "Roles", permission: "roles.read", icon: ShieldCheck },
      { href: "/app/permissions", label: "Permissions", permission: "permissions.read", icon: KeyRound },
      { href: "/app/devices", label: "Devices", permission: "devices.read", icon: MonitorSmartphone },
    ],
  },
  {
    label: "Records",
    items: [
      { href: "/app/activity", label: "Activity log", permission: "activity.read", icon: ScrollText },
      { href: "/app/settings", label: "Settings", permission: "tenant.settings.read", icon: Settings },
    ],
  },
];

function isActive(pathname: string, href: string): boolean {
  return href === "/app"
    ? pathname === "/app"
    : pathname === href || pathname.startsWith(`${href}/`);
}

function NavItems({
  groups,
  pathname,
  onNavigate,
}: {
  groups: typeof NAV_GROUPS;
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex flex-1 flex-col gap-5 overflow-y-auto" aria-label="Main">
      {groups.map((group, gi) => (
        <div key={group.label ?? gi} className="space-y-1">
          {group.label ? (
            <p className="text-muted-foreground px-3 pb-1 text-xs font-medium">{group.label}</p>
          ) : null}
          {group.items.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-9 items-center gap-2.5 rounded-md px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function BrandMark() {
  return (
    <div className="flex items-center gap-2.5 px-2">
      <div
        className="bg-shelf-tag text-shelf-tag-foreground flex size-8 items-center justify-center rounded-md text-sm font-bold"
        aria-hidden
      >
        B
      </div>
      <div className="min-w-0">
        <p className="font-display truncate text-base font-semibold tracking-tight">Blackbox</p>
        <p className="text-muted-foreground text-xs">Back office</p>
      </div>
    </div>
  );
}

function UserFooter({
  fullName,
  email,
  loggingOut,
  onLogout,
}: {
  fullName: string;
  email: string;
  loggingOut: boolean;
  onLogout: () => void;
}) {
  return (
    <div className="border-sidebar-border space-y-3 border-t px-1 pt-4">
      <div className="flex items-center justify-between gap-2 px-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{fullName}</p>
          <p className="text-muted-foreground truncate text-xs">{email}</p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 px-2">
        <ThemeToggle />
        <Button variant="ghost" size="sm" className="gap-2" disabled={loggingOut} onClick={onLogout}>
          <LogOut className="size-3.5" aria-hidden />
          {loggingOut ? "Signing out…" : "Sign out"}
        </Button>
      </div>
    </div>
  );
}

function FullScreenMessage({ children }: { children: ReactNode }) {
  return (
    <div className="bg-background flex min-h-screen items-center justify-center p-6">
      <div className="text-muted-foreground flex max-w-sm flex-col items-center gap-3 text-center text-sm">
        {children}
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, status, logout, hasPermission } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [onboarding, setOnboarding] = useState<"checking" | "ok" | "error">("checking");
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (status === "anonymous") {
      router.replace("/");
    }
  }, [status, router]);

  const checkOnboarding = useCallback(
    async (isCancelled: () => boolean = () => false) => {
      if (!hasPermission("tenant.settings.read")) {
        setOnboarding("ok");
        return;
      }
      setOnboarding("checking");
      try {
        const tenant = await getCurrentTenant();
        if (isCancelled()) return;
        if (!tenant.onboardingCompleted) {
          router.replace("/onboarding/business");
          return;
        }
        setOnboarding("ok");
      } catch {
        // Do not open the workspace on a failed check (review W5); offer a retry instead.
        if (!isCancelled()) setOnboarding("error");
      }
    },
    [hasPermission, router],
  );

  useEffect(() => {
    if (status !== "authenticated" || !user) return;
    let cancelled = false;
    void checkOnboarding(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [status, user, checkOnboarding]);

  if (onboarding === "error" && status === "authenticated") {
    return (
      <FullScreenMessage>
        <p className="text-foreground text-base font-medium">Could not load your business</p>
        <p>Check your internet connection, then try again.</p>
        <Button onClick={() => void checkOnboarding()}>Try again</Button>
      </FullScreenMessage>
    );
  }

  if (status === "loading" || status === "anonymous" || !user || onboarding !== "ok") {
    return (
      <FullScreenMessage>
        <div className="border-border border-t-primary size-8 animate-spin rounded-full border-2" />
        <p>Opening your workspace…</p>
      </FullScreenMessage>
    );
  }

  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.permission || hasPermission(item.permission)),
  })).filter((group) => group.items.length > 0);

  async function onLogout() {
    setLoggingOut(true);
    try {
      await logout();
      router.replace("/");
    } finally {
      setLoggingOut(false);
    }
  }

  const currentLabel =
    groups.flatMap((g) => g.items).find((item) => isActive(pathname, item.href))?.label ??
    "Back office";

  return (
    <div className="bg-background flex min-h-screen">
      <aside className="border-sidebar-border bg-sidebar text-sidebar-foreground sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-6 border-r px-3 py-5 md:flex">
        <BrandMark />
        <NavItems groups={groups} pathname={pathname} />
        <UserFooter
          fullName={user.fullName}
          email={user.email}
          loggingOut={loggingOut}
          onLogout={() => setLogoutOpen(true)}
        />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-border bg-card sticky top-0 z-20 flex h-14 items-center gap-3 border-b px-4 md:hidden">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon-sm" aria-label="Open menu">
                <Menu className="size-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetHeader className="border-b px-4 py-4 text-left">
                <SheetTitle className="sr-only">Navigation</SheetTitle>
                <BrandMark />
              </SheetHeader>
              <div className="flex h-[calc(100%-5rem)] flex-col gap-4 px-3 py-4">
                <NavItems groups={groups} pathname={pathname} onNavigate={() => setMobileOpen(false)} />
                <UserFooter
                  fullName={user.fullName}
                  email={user.email}
                  loggingOut={loggingOut}
                  onLogout={() => setLogoutOpen(true)}
                />
              </div>
            </SheetContent>
          </Sheet>
          <p className="min-w-0 flex-1 truncate text-sm font-semibold">{currentLabel}</p>
        </header>

        <main className="flex-1 overflow-auto px-4 py-6 md:px-10 md:py-8">{children}</main>
      </div>

      <ConfirmDialog
        open={logoutOpen}
        onOpenChange={setLogoutOpen}
        title="Sign out?"
        description="You will be signed out on this browser. Other devices stay signed in."
        confirmLabel="Sign out"
        loading={loggingOut}
        onConfirm={onLogout}
      />
    </div>
  );
}
