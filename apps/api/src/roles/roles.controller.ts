import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import type { TenantContext } from "../common/tenant-context";
import { PermissionsGuard } from "../rbac/permissions.guard";
import { RequirePermissions } from "../rbac/require-permissions.decorator";
import { CreateRoleDto } from "./dto/create-role.dto";
import { ReplaceRolePermissionsDto } from "./dto/replace-role-permissions.dto";
import { UpdateRoleDto } from "./dto/update-role.dto";
import { RolesService } from "./roles.service";

const ROLES_PLATFORM_ONLY =
  "Roles are shared by all shops and are managed by Blackbox support";

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

  // Roles are one shared catalog for every shop (migration 20261112150000_global_roles).
  // A tenant edit would change every shop, so only the platform console may write roles.
  @Post()
  @RequirePermissions("roles.write")
  create(@Body() _dto: CreateRoleDto): never {
    throw new ForbiddenException(ROLES_PLATFORM_ONLY);
  }

  @Patch(":id")
  @RequirePermissions("roles.write")
  update(
    @Param("id", ParseUUIDPipe) _id: string,
    @Body() _dto: UpdateRoleDto,
  ): never {
    throw new ForbiddenException(ROLES_PLATFORM_ONLY);
  }

  @Put(":id/permissions")
  @RequirePermissions("roles.write")
  replacePermissions(
    @Param("id", ParseUUIDPipe) _id: string,
    @Body() _dto: ReplaceRolePermissionsDto,
  ): never {
    throw new ForbiddenException(ROLES_PLATFORM_ONLY);
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
