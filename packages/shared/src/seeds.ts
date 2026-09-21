import type { Permission } from "./permissions";
import { PERMISSIONS } from "./permissions";
import type { DefaultRole } from "./roles";

/**
 * Phase 1 default role → permission seeds.
 * OWNER is the tenant administrator (all Phase 1 permissions except POS sales.write).
 * MANAGER: desktop sales supervision only — no web.access or inventory modules.
 * WAREHOUSE_MANAGER: desktop inventory modules only — no sales or web.access.
 */
/** Owner gets all Phase 1 permissions except POS sale creation (cashier-only). */
const OWNER_PERMISSIONS: Permission[] = PERMISSIONS.filter(
  (p) => p !== "sales.write",
);

export const DEFAULT_ROLE_PERMISSIONS: Record<
  DefaultRole,
  readonly Permission[]
> = {
  OWNER: OWNER_PERMISSIONS,
  MANAGER: [
    "desktop.access",
    "sync.use",
    "sales.read",
    "sales.void",
    "sales.return",
    "till.read",
    "till.manage",
    "activity.read",
  ],
  WAREHOUSE_MANAGER: [
    "desktop.access",
    "sync.use",
    "warehouses.read",
    "warehouses.write",
    "inventory.access",
    "purchasing.access",
    "vendors.access",
  ],
  CASHIER: [
    "desktop.access",
    "sync.use",
    "sales.write",
    "sales.refund",
    "till.read",
  ],
};
