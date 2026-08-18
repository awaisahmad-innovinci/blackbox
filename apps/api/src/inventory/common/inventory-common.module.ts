import { Global, Module } from "@nestjs/common";
import { FixedTenantContext } from "./fixed-tenant.context";

@Global()
@Module({
  providers: [FixedTenantContext],
  exports: [FixedTenantContext],
})
export class InventoryCommonModule {}
