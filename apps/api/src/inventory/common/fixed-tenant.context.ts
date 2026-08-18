import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DEMO_STORE_TENANT_ID } from "@blackbox/shared";

/**
 * Phase A single-tenant scope for inventory routes (no JWT).
 * Later swap for JWT-derived TenantContext without rewriting services.
 */
@Injectable()
export class FixedTenantContext implements OnModuleInit {
  private readonly logger = new Logger(FixedTenantContext.name);
  readonly tenantId: string;

  constructor(config: ConfigService) {
    this.tenantId =
      config.get<string>("DEV_TENANT_ID")?.trim() || DEMO_STORE_TENANT_ID;
  }

  onModuleInit(): void {
    this.logger.log(`Inventory FixedTenantContext tenantId=${this.tenantId}`);
  }
}
