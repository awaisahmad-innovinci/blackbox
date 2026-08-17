/**
 * Default system role keys.
 * Roles are collections of permissions — not authorization allow-lists.
 */
export const DEFAULT_ROLES = [
  "OWNER",
  "MANAGER",
  "WAREHOUSE_MANAGER",
  "CASHIER",
] as const;

export type DefaultRole = (typeof DEFAULT_ROLES)[number];

export const DEFAULT_ROLE_NAMES: Record<DefaultRole, string> = {
  OWNER: "Owner",
  MANAGER: "Manager",
  WAREHOUSE_MANAGER: "Warehouse Manager",
  CASHIER: "Cashier",
};

export function isDefaultRole(value: string): value is DefaultRole {
  return (DEFAULT_ROLES as readonly string[]).includes(value);
}
