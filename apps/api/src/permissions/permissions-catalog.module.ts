import { Module } from "@nestjs/common";
import { RbacModule } from "../rbac/rbac.module";
import { PermissionsCatalogController } from "./permissions-catalog.controller";
import { PermissionsCatalogService } from "./permissions-catalog.service";

@Module({
  imports: [RbacModule],
  controllers: [PermissionsCatalogController],
  providers: [PermissionsCatalogService],
})
export class PermissionsCatalogModule {}
