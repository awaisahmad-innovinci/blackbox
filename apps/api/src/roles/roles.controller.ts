import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import type { TenantContext } from "../common/tenant-context";
import { PermissionsGuard } from "../rbac/permissions.guard";
import { RolesService } from "./roles.service";

@Controller("roles")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  list(@CurrentUser() user: TenantContext) {
    this.assertCanRead(user);
    return this.rolesService.list();
  }

  @Get(":id")
  getById(
    @CurrentUser() user: TenantContext,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    this.assertCanRead(user);
    return this.rolesService.getById(id);
  }

  private assertCanRead(user: TenantContext): void {
    const permissions = user.permissions ?? [];
    if (
      !permissions.includes("roles.read") &&
      !permissions.includes("users.read")
    ) {
      throw new ForbiddenException("Insufficient permissions");
    }
  }
}
