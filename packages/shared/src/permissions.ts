/**
 * Phase 1 permission catalog.
 * Authorization must check these keys — never hard-coded role names.
 */
export const PERMISSIONS = [
  "web.access",
  "desktop.access",
  "tenant.settings.read",
  "tenant.settings.write",
  "users.read",
  "users.write",
  "users.deactivate",
  "roles.read",
  "roles.write",
  "permissions.read",
  "devices.read",
  "devices.manage",
  "sync.use",
  "warehouses.write",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const PERMISSION_DESCRIPTIONS: Record<Permission, string> = {
  "web.access": "Access the web admin application",
  "desktop.access": "Access the desktop application shell",
  "tenant.settings.read": "View tenant settings",
  "tenant.settings.write": "Update tenant settings",
  "users.read": "List and view users",
  "users.write": "Create and update users",
  "users.deactivate": "Deactivate users",
  "roles.read": "List and view roles",
  "roles.write": "Create and update roles and role permissions",
  "permissions.read": "View the permission catalog",
  "devices.read": "List and view devices",
  "devices.manage": "Register, trust, revoke, and manage device associations",
  "sync.use": "Push and pull incremental desktop sync",
  "warehouses.write": "Create, update, and deactivate warehouses",
};

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}
