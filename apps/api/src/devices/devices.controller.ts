import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import type { TenantContext } from "../common/tenant-context";
import { PermissionsGuard } from "../rbac/permissions.guard";
import { RequirePermissions } from "../rbac/require-permissions.decorator";
import { DevicesService } from "./devices.service";

@Controller("devices")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Get()
  @RequirePermissions("devices.read")
  list(@CurrentUser() user: TenantContext) {
    return this.devicesService.list(user.tenantId);
  }

  @Get(":id")
  @RequirePermissions("devices.read")
  getById(
    @CurrentUser() user: TenantContext,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.devicesService.getById(user.tenantId, id);
  }

  @Post(":id/revoke")
  @RequirePermissions("devices.manage")
  revoke(
    @CurrentUser() user: TenantContext,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.devicesService.revoke(user.tenantId, id);
  }
}
