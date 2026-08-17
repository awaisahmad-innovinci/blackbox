import { SetMetadata } from "@nestjs/common";
import type { Permission } from "@blackbox/shared";

export const PERMISSIONS_KEY = "required_permissions";

/**
 * Declare required permission keys for a route.
 * Semantics: AND — the caller must hold every listed permission.
 *
 * @example @RequirePermissions('users.read')
 * @example @RequirePermissions('users.read', 'users.write')
 */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
