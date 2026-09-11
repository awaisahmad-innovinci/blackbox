import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@blackbox/ui/lib/utils";
import { handleEnterNavKeyDown } from "@blackbox/ui/lib/form-keyboard";
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
import { NavDropdownMenuItem } from "@renderer/components/nav-dropdown-menu-item";
import { AddTaxonomyDialog } from "@renderer/features/taxonomy/AddTaxonomyDialog";
import type { TaxonomyKind } from "@renderer/lib/app-nav-keyboard";
import { notifyTaxonomyCreated } from "@renderer/lib/taxonomy-created-sync";
import {
  APP_NAV_SECTIONS,
  appNavShortcutLabel,
  NAV_DROPDOWN_MENUS,
  type NavDropdownId,
} from "@renderer/lib/app-nav-keyboard";
import { afterDialogClosed } from "@renderer/lib/on-dialog-open-change";
import { releaseStuckModalState } from "@renderer/lib/release-stuck-modal-state";
import { useAppNavKeyboard } from "@renderer/lib/use-app-nav-keyboard";

const DEVICE_LABEL: Record<string, string> = {
  unknown: "Device status unknown",
  unbound: "Device not registered",
  pending: "Device awaiting approval",
  trusted: "Device trusted",
  revoked: "Device revoked",
};

function navItemClass(active: boolean): string {
  return cn(
    "inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
    active
      ? "bg-primary/10 text-primary"
      : "text-muted-foreground hover:bg-muted hover:text-foreground",
  );
}

export function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, offline, deviceState, signOut } = useSession();
  const sync = useSyncStatus();
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [openNavDropdown, setOpenNavDropdown] = useState<NavDropdownId | null>(
    null,
  );
  const [globalTaxonomyKind, setGlobalTaxonomyKind] =
    useState<TaxonomyKind | null>(null);
  const { activeIndex, setNavRef, handleMenubarKeyDown, onNavFocus } =
    useAppNavKeyboard({
      openNavDropdown,
      setOpenNavDropdown,
      onGlobalTaxonomyShortcut: setGlobalTaxonomyKind,
    });

  useEffect(() => {
    releaseStuckModalState({ retry: true });
  }, [location.pathname]);

  function hasOpenModal(): boolean {
    return (
      document.querySelector(
        '[data-slot="dialog-content"][data-state="open"]',
      ) != null ||
      document.querySelector(
        '[data-slot="alert-dialog-content"][data-state="open"]',
      ) != null
    );
  }

  function handleNavDropdownChange(id: NavDropdownId, open: boolean) {
    if (open) {
      setOpenNavDropdown(id);
      return;
    }
    setOpenNavDropdown((current) => (current === id ? null : current));
  }

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
    location.pathname.startsWith("/purchasing") ||
    location.pathname.startsWith("/goods-receipts");

  const dashboardSection = APP_NAV_SECTIONS[0]!;
  const warehousesSection = APP_NAV_SECTIONS[1]!;
  const inventorySection = APP_NAV_SECTIONS[2]!;
  const purchasingSection = APP_NAV_SECTIONS[3]!;
  const vendorsSection = APP_NAV_SECTIONS[4]!;

  return (
    <div className="bg-background text-foreground flex min-h-screen flex-col">
      <header className="border-border/80 bg-card/40 sticky top-0 z-10 border-b backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-none items-center gap-6 px-8 lg:px-10">
          <Link to="/" className="text-lg font-semibold tracking-tight">
            Blackbox
          </Link>
          <nav
            role="menubar"
            aria-label="Main"
            className="flex items-center gap-1"
            onKeyDown={handleMenubarKeyDown}
          >
            <NavLink
              ref={setNavRef(0)}
              to={dashboardSection.to}
              end
              role="menuitem"
              tabIndex={activeIndex === 0 ? 0 : -1}
              aria-keyshortcuts={appNavShortcutLabel(dashboardSection.shortcut)}
              title={`${dashboardSection.label} (${appNavShortcutLabel(dashboardSection.shortcut)})`}
              onFocus={() => onNavFocus(0)}
              className={({ isActive }) => navItemClass(isActive)}
            >
              {dashboardSection.label}
            </NavLink>
            <NavLink
              ref={setNavRef(1)}
              to={warehousesSection.to}
              role="menuitem"
              tabIndex={activeIndex === 1 ? 0 : -1}
              aria-keyshortcuts={appNavShortcutLabel(warehousesSection.shortcut)}
              title={`${warehousesSection.label} (${appNavShortcutLabel(warehousesSection.shortcut)})`}
              onFocus={() => onNavFocus(1)}
              className={({ isActive }) => navItemClass(isActive)}
            >
              {warehousesSection.label}
            </NavLink>
            <DropdownMenu
              open={openNavDropdown === "inventory"}
              onOpenChange={(open) => handleNavDropdownChange("inventory", open)}
            >
              <DropdownMenuTrigger
                ref={setNavRef(2)}
                role="menuitem"
                tabIndex={activeIndex === 2 ? 0 : -1}
                aria-keyshortcuts={appNavShortcutLabel(inventorySection.shortcut)}
                title={`${inventorySection.label} (${appNavShortcutLabel(inventorySection.shortcut)})`}
                onFocus={() => onNavFocus(2)}
                className={navItemClass(inventoryActive)}
              >
                {inventorySection.label}
                <span className="text-[10px] opacity-70" aria-hidden>
                  ▼
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {NAV_DROPDOWN_MENUS.inventory.map((item, index) => (
                  <NavDropdownMenuItem
                    key={item.to}
                    index={index}
                    label={item.label}
                    onSelect={() => navigate(item.to)}
                  />
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu
              open={openNavDropdown === "purchasing"}
              onOpenChange={(open) => handleNavDropdownChange("purchasing", open)}
            >
              <DropdownMenuTrigger
                ref={setNavRef(3)}
                role="menuitem"
                tabIndex={activeIndex === 3 ? 0 : -1}
                aria-keyshortcuts={appNavShortcutLabel(purchasingSection.shortcut)}
                title={`${purchasingSection.label} (${appNavShortcutLabel(purchasingSection.shortcut)})`}
                onFocus={() => onNavFocus(3)}
                className={navItemClass(purchasingActive)}
              >
                {purchasingSection.label}
                <span className="text-[10px] opacity-70" aria-hidden>
                  ▼
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {NAV_DROPDOWN_MENUS.purchasing.map((item, index) => (
                  <NavDropdownMenuItem
                    key={item.to}
                    index={index}
                    label={item.label}
                    onSelect={() => navigate(item.to)}
                  />
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu
              open={openNavDropdown === "vendors"}
              onOpenChange={(open) => handleNavDropdownChange("vendors", open)}
            >
              <DropdownMenuTrigger
                ref={setNavRef(4)}
                role="menuitem"
                tabIndex={activeIndex === 4 ? 0 : -1}
                aria-keyshortcuts={appNavShortcutLabel(
                  vendorsSection.shortcut,
                  vendorsSection.requireCtrl,
                )}
                title={`${vendorsSection.label} (${appNavShortcutLabel(
                  vendorsSection.shortcut,
                  vendorsSection.requireCtrl,
                )})`}
                onFocus={() => onNavFocus(4)}
                className={navItemClass(vendorsActive)}
              >
                {vendorsSection.label}
                <span className="text-[10px] opacity-70" aria-hidden>
                  ▼
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {NAV_DROPDOWN_MENUS.vendors.map((item, index) => (
                  <NavDropdownMenuItem
                    key={item.to}
                    index={index}
                    label={item.label}
                    onSelect={() => navigate(item.to)}
                  />
                ))}
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
        className="mx-auto w-full max-w-none flex-1 px-8 py-8 lg:px-10"
        data-enter-nav=""
        onKeyDown={handleEnterNavKeyDown}
        onMouseDown={() => {
          if (!hasOpenModal()) afterDialogClosed();
        }}
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

      {globalTaxonomyKind ? (
        <AddTaxonomyDialog
          open
          kind={globalTaxonomyKind}
          returnFocusTo={
            globalTaxonomyKind === "brand"
              ? "brand"
              : globalTaxonomyKind === "category"
                ? "category"
                : globalTaxonomyKind === "vendor_group"
                  ? "group"
                  : undefined
          }
          onClose={() => setGlobalTaxonomyKind(null)}
          onCreated={(row) => {
            notifyTaxonomyCreated({ kind: globalTaxonomyKind, row });
            setGlobalTaxonomyKind(null);
          }}
        />
      ) : null}
    </div>
  );
}
