import { Module } from "@nestjs/common";
import { PermissionsGuard } from "./permissions.guard";
import { PermissionsService } from "./permissions.service";
import { RbacController } from "./rbac.controller";

@Module({
  controllers: [RbacController],
  providers: [PermissionsService, PermissionsGuard],
  exports: [PermissionsService, PermissionsGuard],
})
export class RbacModule {}
