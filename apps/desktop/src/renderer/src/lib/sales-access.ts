const FULL_NAV_PREFIXES = [
  "products.",
  "inventory.",
  "warehouses.",
  "purchasing.",
  "vendors.",
  "users.",
  "roles.",
  "devices.",
] as const;

export const WAREHOUSE_MODULE_PERMISSIONS = [
  "warehouses.read",
  "inventory.access",
  "purchasing.access",
  "vendors.access",
] as const;

export function isCashierOnlyNav(permissions: string[]): boolean {
  if (!permissions.includes("sales.write")) return false;
  if (isWarehouseModuleUser(permissions)) return false;
  return !permissions.some((p) =>
    FULL_NAV_PREFIXES.some((prefix) => p.startsWith(prefix)),
  );
}

export function isWarehouseModuleUser(permissions: string[]): boolean {
  return WAREHOUSE_MODULE_PERMISSIONS.some((key) => permissions.includes(key));
}

export function isWarehouseOnlyNav(permissions: string[]): boolean {
  return (
    isWarehouseModuleUser(permissions) &&
    !canAccessSalesModule(permissions) &&
    !canAccessActivity(permissions)
  );
}

export function canAccessWarehouses(permissions: string[]): boolean {
  return permissions.includes("warehouses.read");
}

export function canAccessInventoryModule(permissions: string[]): boolean {
  return permissions.includes("inventory.access");
}

export function canAccessPurchasingModule(permissions: string[]): boolean {
  return permissions.includes("purchasing.access");
}

export function canAccessVendorsModule(permissions: string[]): boolean {
  return permissions.includes("vendors.access");
}

export function canAccessSale(permissions: string[]): boolean {
  return isCashierOnlyNav(permissions);
}

export function canAccessSalesList(permissions: string[]): boolean {
  return permissions.includes("sales.read");
}

export function canAccessTill(permissions: string[]): boolean {
  return permissions.includes("till.read");
}

export function canManageTill(permissions: string[]): boolean {
  return permissions.includes("till.manage");
}

export function canAccessActivity(permissions: string[]): boolean {
  return permissions.includes("activity.read");
}

export function canVoidSale(permissions: string[]): boolean {
  return permissions.includes("sales.void");
}

export function canAccessSaleReturn(permissions: string[]): boolean {
  return permissions.includes("sales.return");
}

export function canAccessSalesModule(permissions: string[]): boolean {
  return (
    canAccessSale(permissions) ||
    canAccessSalesList(permissions) ||
    canAccessSaleReturn(permissions)
  );
}

export function showManagerDashboard(permissions: string[]): boolean {
  return (
    !isCashierOnlyNav(permissions) &&
    !isWarehouseOnlyNav(permissions) &&
    (canAccessSalesList(permissions) || canManageTill(permissions))
  );
}

export function showInventoryDashboard(permissions: string[]): boolean {
  return (
    !isCashierOnlyNav(permissions) &&
    (isWarehouseOnlyNav(permissions) || canAccessInventoryModule(permissions))
  );
}

export function salesNavTarget(permissions: string[]): string {
  return isCashierOnlyNav(permissions) ? "/sales/new" : "/sales";
}

export function defaultRouteForUser(permissions: string[]): string {
  if (isCashierOnlyNav(permissions)) return "/sales/new";
  return "/";
}

function isSalesPathAllowed(pathname: string, permissions: string[]): boolean {
  if (pathname === "/sales/stock-overview" || pathname.startsWith("/sales/stock-overview/")) {
    return canAccessSalesList(permissions);
  }
  if (pathname.startsWith("/sales/returns")) {
    return canAccessSaleReturn(permissions);
  }
  if (pathname === "/sales/new" || pathname.startsWith("/sales/new/")) {
    return canAccessSale(permissions);
  }
  if (pathname === "/sales/held") return canAccessSale(permissions);
  if (pathname === "/sales/till") return canAccessTill(permissions);
  if (pathname === "/sales") return canAccessSalesList(permissions);
  return canAccessSalesList(permissions) || canAccessSale(permissions);
}

export function isRouteAllowed(pathname: string, permissions: string[]): boolean {
  if (pathname === "/") {
    return true;
  }

  if (pathname === "/activity") {
    return canAccessActivity(permissions);
  }

  if (pathname === "/sales" || pathname.startsWith("/sales/")) {
    return isSalesPathAllowed(pathname, permissions);
  }

  if (pathname.startsWith("/warehouses")) {
    return canAccessWarehouses(permissions);
  }

  if (
    pathname.startsWith("/products") ||
    pathname.startsWith("/skus") ||
    pathname.startsWith("/brands") ||
    pathname.startsWith("/categories") ||
    pathname.startsWith("/inventory")
  ) {
    return canAccessInventoryModule(permissions);
  }

  if (
    pathname.startsWith("/purchase-orders") ||
    pathname.startsWith("/purchasing") ||
    pathname.startsWith("/goods-receipts")
  ) {
    return canAccessPurchasingModule(permissions);
  }

  if (
    pathname.startsWith("/vendors") ||
    pathname.startsWith("/vendor-groups")
  ) {
    return canAccessVendorsModule(permissions);
  }

  return false;
}

export function canUseInventoryTaxonomyShortcut(permissions: string[]): boolean {
  return canAccessInventoryModule(permissions);
}

export function canUseVendorTaxonomyShortcut(permissions: string[]): boolean {
  return canAccessVendorsModule(permissions);
}

export function canUseVendorReturnShortcut(permissions: string[]): boolean {
  return canAccessInventoryModule(permissions);
}
