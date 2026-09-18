import {
  canAccessSalesList,
  canAccessSaleReturn,
  isCashierOnlyNav,
} from "./sales-access";

export type NavDropdownId = "inventory" | "purchasing" | "vendors";

export type NavDropdownItem = { label: string; to: string };

export type TaxonomyKind = "brand" | "category" | "vendor_group";

export const NAV_DROPDOWN_MENUS: Record<NavDropdownId, NavDropdownItem[]> = {
  inventory: [
    { label: "Add Product", to: "/products/new" },
    { label: "See Products", to: "/products" },
    { label: "Brands", to: "/brands" },
    { label: "Categories", to: "/categories" },
    { label: "Inventory Out", to: "/inventory/out" },
    { label: "Out Returns", to: "/inventory/out-returns" },
    { label: "Vendor Returns", to: "/inventory/returns" },
    { label: "In / out report", to: "/inventory/reports" },
  ],
  purchasing: [
    { label: "Create Purchase Order", to: "/purchase-orders/new" },
    { label: "Purchase Orders", to: "/purchase-orders" },
    { label: "Purchase Vouchers", to: "/goods-receipts" },
  ],
  vendors: [
    { label: "Add Vendor", to: "/vendors/new" },
    { label: "See Vendors", to: "/vendors" },
    { label: "Vendor Groups", to: "/vendor-groups" },
  ],
};

export type AppNavSectionId =
  | "dashboard"
  | "sale"
  | "activity"
  | "warehouses"
  | "inventory"
  | "purchasing"
  | "vendors";

type AppNavLinkSection = {
  id: AppNavSectionId;
  label: string;
  shortcut: string;
  kind: "link";
  to: string;
  requiresPermission?: string;
  requireCtrl?: boolean;
};

type AppNavDropdownSection = {
  id: AppNavSectionId;
  label: string;
  shortcut: string;
  kind: "dropdown";
  dropdownId: NavDropdownId;
  requireCtrl?: boolean;
};

export type AppNavSection = AppNavLinkSection | AppNavDropdownSection;

export const APP_NAV_SECTIONS = [
  {
    id: "dashboard",
    label: "Dashboard",
    shortcut: "d",
    kind: "link",
    to: "/",
  },
  {
    id: "sale",
    label: "Sale",
    shortcut: "s",
    kind: "link",
    to: "/sales/new",
    requiresPermission: "sales.write",
  },
  {
    id: "activity",
    label: "Activity",
    shortcut: "a",
    kind: "link",
    to: "/activity",
    requiresPermission: "activity.read",
  },
  {
    id: "warehouses",
    label: "Warehouses",
    shortcut: "w",
    kind: "link",
    to: "/warehouses",
  },
  {
    id: "inventory",
    label: "Inventory",
    shortcut: "i",
    kind: "dropdown",
    dropdownId: "inventory",
  },
  {
    id: "purchasing",
    label: "Purchasing",
    shortcut: "p",
    kind: "dropdown",
    dropdownId: "purchasing",
  },
  {
    id: "vendors",
    label: "Vendors",
    shortcut: "v",
    requireCtrl: true,
    kind: "dropdown",
    dropdownId: "vendors",
  },
] as const;

export const GLOBAL_TAXONOMY_SHORTCUTS = [
  { kind: "brand", shortcut: "b" },
  { kind: "category", shortcut: "c" },
  { kind: "vendor_group", shortcut: "g", requireCtrl: true },
] as const satisfies ReadonlyArray<{
  kind: TaxonomyKind;
  shortcut: string;
  requireCtrl?: boolean;
}>;

export const GLOBAL_NAV_SHORTCUTS = [
  { shortcut: "r", to: "/inventory/returns/new" },
] as const;

function navModifiersMatch(event: KeyboardEvent, requireCtrl: boolean): boolean {
  if (!event.altKey || event.shiftKey || event.metaKey) return false;
  return requireCtrl ? event.ctrlKey : !event.ctrlKey;
}

export function matchAppNavShortcut(
  event: KeyboardEvent,
): AppNavSectionId | null {
  const key = event.key.toLowerCase();
  const section = APP_NAV_SECTIONS.find((s) => s.shortcut === key);
  if (!section) return null;
  if (
    !navModifiersMatch(
      event,
      "requireCtrl" in section ? section.requireCtrl : false,
    )
  ) {
    return null;
  }

  event.preventDefault();
  return section.id;
}

export function appNavShortcutLabel(
  shortcut: string,
  requireCtrl = false,
): string {
  return requireCtrl
    ? `Ctrl+Alt+${shortcut.toUpperCase()}`
    : `Alt+${shortcut.toUpperCase()}`;
}

export function globalTaxonomyShortcutLabel(
  shortcut: string,
  requireCtrl = false,
): string {
  return appNavShortcutLabel(shortcut, requireCtrl);
}

export function matchGlobalTaxonomyShortcut(
  event: KeyboardEvent,
): TaxonomyKind | null {
  const key = event.key.toLowerCase();
  const match = GLOBAL_TAXONOMY_SHORTCUTS.find((s) => s.shortcut === key);
  if (!match) return null;
  if (
    !navModifiersMatch(
      event,
      "requireCtrl" in match ? match.requireCtrl : false,
    )
  ) {
    return null;
  }

  event.preventDefault();
  return match.kind;
}

export function matchGlobalNavShortcut(event: KeyboardEvent): string | null {
  if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return null;
  }

  const key = event.key.toLowerCase();
  const match = GLOBAL_NAV_SHORTCUTS.find((s) => s.shortcut === key);
  if (!match) return null;

  event.preventDefault();
  return match.to;
}

export function parseNavMenuDigit(key: string): number | null {
  if (key.length === 1 && key >= "1" && key <= "9") {
    return Number(key);
  }
  if (key.startsWith("Numpad") && key.length === 7) {
    const digit = Number(key.slice(6));
    if (digit >= 1 && digit <= 9) return digit;
  }
  return null;
}

export function matchNavDropdownItem(
  event: KeyboardEvent,
  openDropdownId: NavDropdownId | null,
): string | null {
  if (!openDropdownId) return null;
  if (event.altKey || event.ctrlKey || event.metaKey) return null;

  const digit = parseNavMenuDigit(event.key);
  if (digit === null) return null;

  const item = NAV_DROPDOWN_MENUS[openDropdownId][digit - 1];
  if (!item) return null;

  event.preventDefault();
  return item.to;
}

function resolveSaleNavSection(permissions: string[]): AppNavLinkSection | null {
  if (isCashierOnlyNav(permissions)) {
    const sale = APP_NAV_SECTIONS.find((s) => s.id === "sale");
    if (!sale || sale.kind !== "link") return null;
    return {
      id: "sale",
      label: sale.label,
      shortcut: sale.shortcut,
      kind: "link",
      to: sale.to,
      requiresPermission: sale.requiresPermission,
    };
  }
  if (
    canAccessSalesList(permissions) ||
    canAccessSaleReturn(permissions)
  ) {
    return {
      id: "sale",
      label: "Sales",
      shortcut: "s",
      kind: "link",
      to: "/sales",
    };
  }
  return null;
}

export function visibleNavSections(permissions: string[]): AppNavSection[] {
  if (isCashierOnlyNav(permissions)) {
    return APP_NAV_SECTIONS.filter(
      (s) => s.id === "dashboard" || s.id === "sale",
    ).map((section) => normalizeNavSection(section));
  }

  return APP_NAV_SECTIONS.flatMap((section) => {
    if (section.id === "sale") {
      const resolved = resolveSaleNavSection(permissions);
      return resolved ? [resolved] : [];
    }
    if ("requiresPermission" in section) {
      return permissions.includes(section.requiresPermission)
        ? [normalizeNavSection(section)]
        : [];
    }
    return [normalizeNavSection(section)];
  });
}

function normalizeNavSection(
  section: (typeof APP_NAV_SECTIONS)[number],
): AppNavSection {
  if (section.kind === "dropdown") {
    return {
      id: section.id,
      label: section.label,
      shortcut: section.shortcut,
      kind: "dropdown",
      dropdownId: section.dropdownId,
      ...("requireCtrl" in section ? { requireCtrl: section.requireCtrl } : {}),
    };
  }
  return {
    id: section.id,
    label: section.label,
    shortcut: section.shortcut,
    kind: "link",
    to: section.to,
    ...("requiresPermission" in section
      ? { requiresPermission: section.requiresPermission }
      : {}),
  };
}
