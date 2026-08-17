import { Module } from "@nestjs/common";
import { RbacModule } from "../rbac/rbac.module";
import { TenantsController } from "./tenants.controller";
import { TenantsService } from "./tenants.service";

@Module({
  imports: [RbacModule],
  controllers: [TenantsController],
  providers: [TenantsService],
})
export class TenantsModule {}
