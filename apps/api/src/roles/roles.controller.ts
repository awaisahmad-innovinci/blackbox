import {
  Body,
  Controller,
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

@Controller("roles")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @RequirePermissions("roles.read")
  list(@CurrentUser() user: TenantContext) {
    return this.rolesService.list(user.tenantId);
  }

  @Get(":id")
  @RequirePermissions("roles.read")
  getById(
    @CurrentUser() user: TenantContext,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.rolesService.getById(user.tenantId, id);
  }

  @Post()
  @RequirePermissions("roles.write")
  create(@CurrentUser() user: TenantContext, @Body() dto: CreateRoleDto) {
    return this.rolesService.create(user.tenantId, dto);
  }

  @Patch(":id")
  @RequirePermissions("roles.write")
  update(
    @CurrentUser() user: TenantContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.rolesService.update(user.tenantId, id, dto);
  }

  @Put(":id/permissions")
  @RequirePermissions("roles.write")
  replacePermissions(
    @CurrentUser() user: TenantContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ReplaceRolePermissionsDto,
  ) {
    return this.rolesService.replacePermissions(user.tenantId, id, dto);
  }
}
