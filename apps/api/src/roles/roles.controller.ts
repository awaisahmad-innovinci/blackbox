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

  @Post()
  @RequirePermissions("roles.write")
  create(@Body() dto: CreateRoleDto) {
    return this.rolesService.create(dto);
  }

  @Patch(":id")
  @RequirePermissions("roles.write")
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.rolesService.update(id, dto);
  }

  @Put(":id/permissions")
  @RequirePermissions("roles.write")
  replacePermissions(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ReplaceRolePermissionsDto,
  ) {
    return this.rolesService.replacePermissions(id, dto);
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
