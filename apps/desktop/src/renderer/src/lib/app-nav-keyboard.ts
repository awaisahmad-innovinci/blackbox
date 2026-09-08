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
  | "warehouses"
  | "inventory"
  | "purchasing"
  | "vendors";

export const APP_NAV_SECTIONS = [
  {
    id: "dashboard",
    label: "Dashboard",
    shortcut: "d",
    kind: "link",
    to: "/",
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
    kind: "dropdown",
    dropdownId: "vendors",
  },
] as const;

export const GLOBAL_TAXONOMY_SHORTCUTS = [
  { kind: "brand", shortcut: "b" },
  { kind: "category", shortcut: "c" },
  { kind: "vendor_group", shortcut: "g" },
] as const satisfies ReadonlyArray<{ kind: TaxonomyKind; shortcut: string }>;

export const GLOBAL_NAV_SHORTCUTS = [
  { shortcut: "r", to: "/inventory/returns/new" },
] as const;

export function matchAppNavShortcut(
  event: KeyboardEvent,
): AppNavSectionId | null {
  if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return null;
  }

  const key = event.key.toLowerCase();
  const section = APP_NAV_SECTIONS.find((s) => s.shortcut === key);
  if (!section) return null;

  event.preventDefault();
  return section.id;
}

export function appNavShortcutLabel(shortcut: string): string {
  return `Alt+${shortcut.toUpperCase()}`;
}

export function globalTaxonomyShortcutLabel(shortcut: string): string {
  return appNavShortcutLabel(shortcut);
}

export function matchGlobalTaxonomyShortcut(
  event: KeyboardEvent,
): TaxonomyKind | null {
  if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return null;
  }

  const key = event.key.toLowerCase();
  const match = GLOBAL_TAXONOMY_SHORTCUTS.find((s) => s.shortcut === key);
  if (!match) return null;

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
