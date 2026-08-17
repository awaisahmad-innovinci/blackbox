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
import { CreateUserDto } from "./dto/create-user.dto";
import { ReplaceUserRolesDto } from "./dto/replace-user-roles.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { UsersService } from "./users.service";

@Controller("users")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @RequirePermissions("users.read")
  list(@CurrentUser() user: TenantContext) {
    return this.usersService.list(user.tenantId);
  }

  @Get(":id")
  @RequirePermissions("users.read")
  getById(
    @CurrentUser() user: TenantContext,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.usersService.getById(user.tenantId, id);
  }

  @Post()
  @RequirePermissions("users.write")
  create(@CurrentUser() user: TenantContext, @Body() dto: CreateUserDto) {
    return this.usersService.create(user.tenantId, dto);
  }

  @Patch(":id")
  @RequirePermissions("users.write")
  update(
    @CurrentUser() user: TenantContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.update(user.tenantId, id, dto);
  }

  @Post(":id/deactivate")
  @RequirePermissions("users.deactivate")
  deactivate(
    @CurrentUser() user: TenantContext,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.usersService.deactivate(user.tenantId, id);
  }

  @Put(":id/roles")
  @RequirePermissions("users.write")
  replaceRoles(
    @CurrentUser() user: TenantContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ReplaceUserRolesDto,
  ) {
    return this.usersService.replaceRoles(user.tenantId, id, dto);
  }
}
