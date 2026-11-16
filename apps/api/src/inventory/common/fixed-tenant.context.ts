import { Injectable, UnauthorizedException } from "@nestjs/common";
import { getRequestTenant } from "../../common/request-tenant";

/**
 * Tenant scope for the current request, read from the JWT via the request-tenant ALS.
 * There is no fallback tenant: a request without a JWT tenant is rejected.
 */
@Injectable()
export class FixedTenantContext {
  get tenantId(): string {
    const tenantId = getRequestTenant()?.tenantId;
    if (!tenantId) {
      throw new UnauthorizedException("Authentication required");
    }
    return tenantId;
  }

  get deviceId(): string | null {
    return getRequestTenant()?.deviceId ?? null;
  }
}
