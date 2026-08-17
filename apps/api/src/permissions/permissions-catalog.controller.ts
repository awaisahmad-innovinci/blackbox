import { Controller, Get, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PermissionsGuard } from "../rbac/permissions.guard";
import { RequirePermissions } from "../rbac/require-permissions.decorator";
import { PermissionsCatalogService } from "./permissions-catalog.service";

@Controller("permissions")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PermissionsCatalogController {
  constructor(private readonly catalog: PermissionsCatalogService) {}

  @Get()
  @RequirePermissions("permissions.read")
  list() {
    return this.catalog.list();
  }
}
