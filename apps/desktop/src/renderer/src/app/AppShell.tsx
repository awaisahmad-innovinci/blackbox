import { useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@blackbox/ui/lib/utils";
import { handleEnterToNextField } from "@blackbox/ui/lib/form-keyboard";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@blackbox/ui/dropdown-menu";
import { useSession } from "@renderer/lib/session/context";
import { syncNow, useSyncStatus } from "@renderer/lib/sync/sync-status";
import { ConfirmDialog } from "@renderer/components/confirm-dialog";

const NAV = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/warehouses", label: "Warehouses" },
] as const;

const DEVICE_LABEL: Record<string, string> = {
  unknown: "Device status unknown",
  unbound: "Device not registered",
  pending: "Device awaiting approval",
  trusted: "Device trusted",
  revoked: "Device revoked",
};

export function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, offline, deviceState, signOut } = useSession();
  const sync = useSyncStatus();
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const vendorsActive =
    location.pathname.startsWith("/vendors") ||
    location.pathname.startsWith("/vendor-groups");
  const inventoryActive =
    location.pathname.startsWith("/products") ||
    location.pathname.startsWith("/skus") ||
    location.pathname.startsWith("/inventory") ||
    location.pathname.startsWith("/brands") ||
    location.pathname.startsWith("/categories");
  const purchasingActive =
    location.pathname.startsWith("/purchase-orders") ||
    location.pathname.startsWith("/purchasing");

  return (
    <div className="bg-background text-foreground flex min-h-screen flex-col">
      <header className="border-border/80 bg-card/40 sticky top-0 z-10 border-b backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-6">
          <Link to="/" className="text-lg font-semibold tracking-tight">
            Blackbox
          </Link>
          <nav className="flex items-center gap-1">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={"end" in item ? item.end : false}
                className={({ isActive }) =>
                  cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
            <DropdownMenu>
              <DropdownMenuTrigger
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  inventoryActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                Inventory
                <span className="text-[10px] opacity-70" aria-hidden>
                  ▼
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onSelect={() => navigate("/products/new")}>
                  Add Product
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => navigate("/products")}>
                  See Products
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => navigate("/brands")}>
                  Brands
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => navigate("/categories")}>
                  Categories
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => navigate("/inventory/out")}>
                  Inventory Out
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => navigate("/inventory/reports")}
                >
                  In / out report
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  purchasingActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                Purchasing
                <span className="text-[10px] opacity-70" aria-hidden>
                  ▼
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem
                  onSelect={() => navigate("/purchase-orders/new")}
                >
                  Create Purchase Order
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => navigate("/purchase-orders")}>
                  Purchase Orders
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  vendorsActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                Vendors
                <span className="text-[10px] opacity-70" aria-hidden>
                  ▼
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onSelect={() => navigate("/vendors/new")}>
                  Add Vendor
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => navigate("/vendors")}>
                  See Vendors
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => navigate("/vendor-groups")}>
                  Vendor Groups
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <button
              type="button"
              onClick={() => void syncNow()}
              disabled={sync.syncing}
              className={cn(
                "rounded-md px-2 py-1 text-xs font-medium transition-colors",
                sync.lastError
                  ? "text-destructive hover:bg-destructive/10"
                  : "text-muted-foreground hover:bg-muted",
              )}
              title={sync.lastError ?? "Sync pending changes now"}
            >
              {sync.syncing
                ? "Syncing…"
                : sync.lastError
                  ? `Sync issue${sync.pending ? ` · ${sync.pending} queued` : ""}`
                  : sync.pending
                    ? `${sync.pending} queued`
                    : "Synced"}
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger className="text-muted-foreground hover:bg-muted hover:text-foreground rounded-md px-3 py-1.5 text-sm font-medium transition-colors">
                {user?.fullName ?? user?.username ?? "Account"}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <div className="px-2 py-1.5 text-xs">
                  <p className="font-medium">{user?.email ?? "Offline session"}</p>
                  <p className="text-muted-foreground mt-1">
                    {DEVICE_LABEL[deviceState] ?? DEVICE_LABEL.unknown}
                    {offline ? " · working offline" : ""}
                  </p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void syncNow()}>
                  Sync now
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setLogoutOpen(true)}>
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
      {deviceState === "pending" || deviceState === "revoked" ? (
        <div
          role="status"
          className={cn(
            "border-b px-6 py-2 text-center text-xs",
            deviceState === "revoked"
              ? "border-destructive/40 bg-destructive/5 text-destructive"
              : "border-amber-500/40 bg-amber-500/5 text-amber-900 dark:text-amber-200",
          )}
        >
          {deviceState === "revoked"
            ? "This device was revoked. Local changes will not sync — contact an owner."
            : "This device is awaiting owner approval. Changes are saved locally and sync once it is trusted."}
        </div>
      ) : null}
      <main
        className="mx-auto w-full max-w-6xl flex-1 px-6 py-8"
        data-enter-nav=""
        onKeyDown={handleEnterToNextField}
      >
        <Outlet />
      </main>

      <ConfirmDialog
        open={logoutOpen}
        onOpenChange={setLogoutOpen}
        title="Are you sure you want to logout?"
        description="Are you sure you want to logout?"
        confirmLabel="Yes"
        cancelLabel="Cancel"
        loading={loggingOut}
        onConfirm={async () => {
          setLoggingOut(true);
          try {
            await signOut();
          } finally {
            setLoggingOut(false);
            setLogoutOpen(false);
          }
        }}
      />
    </div>
  );
}
