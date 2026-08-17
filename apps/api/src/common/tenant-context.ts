import type { Permission } from "@blackbox/shared";

/** Authenticated request context — tenant always from JWT, never from client body. */
export interface TenantContext {
  userId: string;
  tenantId: string;
  email: string;
  permissions: Permission[];
}

export const REQUEST_TENANT_CONTEXT = "tenantContext";
