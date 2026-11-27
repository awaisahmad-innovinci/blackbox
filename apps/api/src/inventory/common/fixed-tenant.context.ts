import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DEMO_STORE_TENANT_ID } from "@blackbox/shared";
import { getRequestTenant } from "../../common/request-tenant";

/**
 * Inventory tenant scope: JWT ALS when present, otherwise DEV_TENANT_ID.
 */
@Injectable()
export class FixedTenantContext implements OnModuleInit {
  private readonly logger = new Logger(FixedTenantContext.name);

  constructor(private readonly config: ConfigService) {}

  private devTenantFallback(): string {
    return (
      this.config.get<string>("DEV_TENANT_ID")?.trim() || DEMO_STORE_TENANT_ID
    );
  }

  get tenantId(): string {
    const fromJwt = getRequestTenant()?.tenantId;
    const resolved = fromJwt ?? this.devTenantFallback();
    // #region agent log
    if (!fromJwt) {
      fetch("http://127.0.0.1:7833/ingest/5c639e3b-d485-4142-8cf3-71119b248855", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Debug-Session-Id": "9ce663",
        },
        body: JSON.stringify({
          sessionId: "9ce663",
          hypothesisId: "A",
          location: "fixed-tenant.context.ts:tenantId",
          message: "tenant without JWT ALS",
          data: { resolved, fallback: this.devTenantFallback() },
          timestamp: Date.now(),
        }),
      }).catch(() => undefined);
    }
    // #endregion
    return resolved;
  }

  get deviceId(): string | null {
    return getRequestTenant()?.deviceId ?? null;
  }

  onModuleInit(): void {
    this.logger.log(
      `Inventory tenant fallback=${this.devTenantFallback()} (JWT overrides when present)`,
    );
  }
}
