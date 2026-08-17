import type { Permission } from "./permissions";
import { PERMISSIONS } from "./permissions";
import type { DefaultRole } from "./roles";

/**
 * Phase 1 default role → permission seeds.
 * OWNER is the tenant administrator (all Phase 1 permissions).
 * MANAGER does not receive web.access, roles.write, or devices.manage.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<
  DefaultRole,
  readonly Permission[]
> = {
  OWNER: [...PERMISSIONS],
  MANAGER: [
    "desktop.access",
    "users.read",
    "users.write",
    "roles.read",
    "permissions.read",
    "devices.read",
    "tenant.settings.read",
  ],
  WAREHOUSE_MANAGER: ["desktop.access"],
  CASHIER: ["desktop.access"],
};
