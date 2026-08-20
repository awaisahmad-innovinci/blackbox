"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import type { Permission } from "@blackbox/shared";
import {
  LayoutDashboard,
  Users,
  Shield,
  KeyRound,
  MonitorSmartphone,
  Settings,
  LogOut,
  Menu,
  PanelLeftClose,
  BarChart3,
} from "lucide-react";
import { Button } from "@blackbox/ui/button";
import { Separator } from "@blackbox/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@blackbox/ui/sheet";
import { cn } from "@blackbox/ui/lib/utils";
import { useAuth } from "@/components/auth-provider";
import { getCurrentTenant } from "@/lib/admin-api";

const NAV: {
  href: string;
  label: string;
  permission: Permission | null;
  icon: typeof LayoutDashboard;
}[] = [
  { href: "/app", label: "Dashboard", permission: null, icon: LayoutDashboard },
  { href: "/app/users", label: "Users", permission: "users.read", icon: Users },
  { href: "/app/roles", label: "Roles", permission: "roles.read", icon: Shield },
  {
    href: "/app/permissions",
    label: "Permissions",
    permission: "permissions.read",
    icon: KeyRound,
  },
  {
    href: "/app/devices",
    label: "Devices",
    permission: "devices.read",
    icon: MonitorSmartphone,
  },
  {
    href: "/app/inventory/reports",
    label: "Inventory report",
    permission: null,
    icon: BarChart3,
  },
  {
    href: "/app/settings",
    label: "Settings",
    permission: "tenant.settings.read",
    icon: Settings,
  },
];

function NavItems({
  items,
  pathname,
  onNavigate,
}: {
  items: typeof NAV;
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex flex-1 flex-col gap-1" aria-label="Main">
      {items.map((item) => {
        const active =
          item.href === "/app"
            ? pathname === "/app"
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Button
            key={item.href}
            asChild
            variant={active ? "secondary" : "ghost"}
            className={cn(
              "h-10 justify-start gap-2.5 px-3 font-medium",
              active &&
                "bg-sidebar-accent text-sidebar-accent-foreground shadow-none",
            )}
          >
            <Link href={item.href} onClick={onNavigate}>
              <Icon className="size-4 opacity-80" aria-hidden />
              {item.label}
            </Link>
          </Button>
        );
      })}
    </nav>
  );
}

function BrandMark() {
  return (
    <div className="flex items-center gap-2.5 px-2">
      <div
        className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-lg text-xs font-bold tracking-tight"
        aria-hidden
      >
        Bx
      </div>
      <div className="min-w-0">
        <p className="font-display truncate text-base font-semibold tracking-tight">
          Blackbox
        </p>
        <p className="text-muted-foreground text-[11px] tracking-wide uppercase">
          Workspace admin
        </p>
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
    <div className="space-y-3 px-1">
      <div className="px-2">
        <p className="truncate text-sm font-medium">{fullName}</p>
        <p className="text-muted-foreground truncate text-xs">{email}</p>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="w-full justify-start gap-2"
        disabled={loggingOut}
        onClick={onLogout}
      >
        <LogOut className="size-3.5" aria-hidden />
        {loggingOut ? "Signing out…" : "Log out"}
      </Button>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, status, logout, hasPermission } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [loggingOut, setLoggingOut] = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (status === "anonymous") {
      router.replace("/");
    }
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated" || !user) {
      return;
    }
    if (!hasPermission("tenant.settings.read")) {
      setOnboardingChecked(true);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const tenant = await getCurrentTenant();
        if (cancelled) return;
        if (!tenant.onboardingCompleted) {
          router.replace("/onboarding/business");
          return;
        }
        setOnboardingChecked(true);
      } catch {
        if (!cancelled) {
          setOnboardingChecked(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [status, user, hasPermission, router]);

  if (
    status === "loading" ||
    status === "anonymous" ||
    !user ||
    !onboardingChecked
  ) {
    return (
      <div className="bg-background flex min-h-screen items-center justify-center">
        <div className="text-muted-foreground flex flex-col items-center gap-3 text-sm">
          <div className="border-border border-t-primary size-8 animate-spin rounded-full border-2" />
          <p>Preparing workspace…</p>
        </div>
      </div>
    );
  }

  const items = NAV.filter((item) => {
    if (!item.permission) return true;
    return hasPermission(item.permission);
  });

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
    items.find((item) =>
      item.href === "/app"
        ? pathname === "/app"
        : pathname === item.href || pathname.startsWith(`${item.href}/`),
    )?.label ?? "Admin";

  return (
    <div className="bg-background flex min-h-screen">
      <aside className="border-sidebar-border bg-sidebar text-sidebar-foreground sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r px-3 py-4 md:flex">
        <div className="pb-5">
          <BrandMark />
        </div>
        <NavItems items={items} pathname={pathname} />
        <Separator className="my-3" />
        <UserFooter
          fullName={user.fullName}
          email={user.email}
          loggingOut={loggingOut}
          onLogout={() => void onLogout()}
        />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-border/80 bg-background/80 supports-[backdrop-filter]:bg-background/70 sticky top-0 z-20 flex h-14 items-center gap-3 border-b px-4 backdrop-blur md:hidden">
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
              <div className="flex h-[calc(100%-5rem)] flex-col px-3 py-4">
                <NavItems
                  items={items}
                  pathname={pathname}
                  onNavigate={() => setMobileOpen(false)}
                />
                <Separator className="my-3" />
                <UserFooter
                  fullName={user.fullName}
                  email={user.email}
                  loggingOut={loggingOut}
                  onLogout={() => void onLogout()}
                />
              </div>
            </SheetContent>
          </Sheet>
          <div className="min-w-0 flex-1">
            <p className="font-display truncate text-sm font-semibold">
              Blackbox
            </p>
            <p className="text-muted-foreground truncate text-xs">
              {currentLabel}
            </p>
          </div>
          <PanelLeftClose className="text-muted-foreground size-4 opacity-40" aria-hidden />
        </header>

        <main className="flex-1 overflow-auto p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
