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
  private readonly fallbackTenantId: string;

  constructor(config: ConfigService) {
    this.fallbackTenantId =
      config.get<string>("DEV_TENANT_ID")?.trim() || DEMO_STORE_TENANT_ID;
  }

  get tenantId(): string {
    return getRequestTenant()?.tenantId ?? this.fallbackTenantId;
  }

  get deviceId(): string | null {
    return getRequestTenant()?.deviceId ?? null;
  }

  onModuleInit(): void {
    this.logger.log(
      `Inventory tenant fallback=${this.fallbackTenantId} (JWT overrides when present)`,
    );
  }
}
