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
import { PermissionsCatalogService } from "../permissions/permissions-catalog.service";
import { CreateRoleDto } from "../roles/dto/create-role.dto";
import { ReplaceRolePermissionsDto } from "../roles/dto/replace-role-permissions.dto";
import { UpdateRoleDto } from "../roles/dto/update-role.dto";
import { RolesService } from "../roles/roles.service";
import { PlatformAuthGuard } from "./platform-auth.guard";

@Controller("platform")
@UseGuards(PlatformAuthGuard)
export class PlatformRolesController {
  constructor(
    private readonly roles: RolesService,
    private readonly catalog: PermissionsCatalogService,
  ) {}

  @Get("permissions")
  listPermissions() {
    return this.catalog.list();
  }

  @Get("roles")
  listRoles() {
    return this.roles.list();
  }

  @Post("roles")
  createRole(@Body() dto: CreateRoleDto) {
    return this.roles.create(dto);
  }

  @Get("roles/:id")
  getRole(@Param("id", ParseUUIDPipe) id: string) {
    return this.roles.getById(id);
  }

  @Patch("roles/:id")
  updateRole(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.roles.update(id, dto);
  }

  @Put("roles/:id/permissions")
  replacePermissions(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ReplaceRolePermissionsDto,
  ) {
    return this.roles.replacePermissions(id, dto);
  }
}
