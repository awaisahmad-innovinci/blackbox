import type { Permission } from "./permissions";
import { PERMISSIONS } from "./permissions";
import type { DefaultRole } from "./roles";

/**
 * Phase 1 default role → permission seeds.
 * OWNER is the tenant administrator (all Phase 1 permissions except POS sales.write).
 * MANAGER does not receive web.access, roles.write, devices.manage, or sales.write.
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
    "users.read",
    "users.write",
    "roles.read",
    "permissions.read",
    "devices.read",
    "tenant.settings.read",
    "sync.use",
    "sales.read",
    "sales.void",
    "sales.return",
    "till.read",
    "till.manage",
    "activity.read",
    "warehouses.write",
  ],
  WAREHOUSE_MANAGER: ["desktop.access", "sync.use"],
  CASHIER: ["desktop.access", "sync.use", "sales.write", "till.read"],
};
