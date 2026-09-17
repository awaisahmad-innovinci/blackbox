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

export function isCashierOnlyNav(permissions: string[]): boolean {
  if (!permissions.includes("sales.write")) return false;
  return !permissions.some((p) =>
    FULL_NAV_PREFIXES.some((prefix) => p.startsWith(prefix)),
  );
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

export function defaultRouteForUser(permissions: string[]): string {
  if (isCashierOnlyNav(permissions)) return "/sales/new";
  return "/";
}

export function isRouteAllowed(pathname: string, permissions: string[]): boolean {
  if (pathname === "/" || pathname.startsWith("/sales") || pathname === "/activity") {
    if (pathname === "/") return true;
    if (pathname === "/activity") return canAccessActivity(permissions);
    if (pathname === "/sales" || pathname.startsWith("/sales/")) {
      if (pathname === "/sales/new" || pathname.startsWith("/sales/new/")) {
        return canAccessSale(permissions);
      }
      if (pathname === "/sales/held") return canAccessSale(permissions);
      if (pathname === "/sales/till") return canAccessTill(permissions);
      if (pathname === "/sales") return canAccessSalesList(permissions);
      return canAccessSalesList(permissions) || canAccessSale(permissions);
    }
  }

  if (isCashierOnlyNav(permissions)) return false;

  return true;
}
