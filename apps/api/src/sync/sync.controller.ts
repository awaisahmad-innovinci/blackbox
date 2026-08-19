import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import type { SyncPushResponse, SyncStatusResponse } from "@blackbox/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import type { TenantContext } from "../common/tenant-context";
import { PermissionsGuard } from "../rbac/permissions.guard";
import { RequirePermissions } from "../rbac/require-permissions.decorator";
import { SyncConflictAckDto, SyncPushDto } from "./dto/sync.dto";
import { SyncService } from "./sync.service";

@Controller("sync")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Post("push")
  @RequirePermissions("sync.use")
  push(
    @CurrentUser() user: TenantContext,
    @Body() dto: SyncPushDto,
  ): Promise<SyncPushResponse> {
    return this.sync.push(user, dto);
  }

  @Get("pull")
  @RequirePermissions("sync.use")
  pull(
    @CurrentUser() user: TenantContext,
    @Query("stream") stream: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ) {
    return this.sync.pull(user, stream, cursor, limit);
  }

  @Get("status")
  @RequirePermissions("sync.use")
  status(@CurrentUser() user: TenantContext): Promise<SyncStatusResponse> {
    return this.sync.status(user);
  }

  @Post("full-resync-complete")
  @RequirePermissions("sync.use")
  completeFullResync(@CurrentUser() user: TenantContext) {
    return this.sync.completeFullResync(user);
  }

  @Post("ack-conflicts")
  @RequirePermissions("sync.use")
  ack(
    @CurrentUser() user: TenantContext,
    @Body() dto: SyncConflictAckDto,
  ) {
    return this.sync.ackConflict(user, dto.conflictId, dto.resolution);
  }

  @Post("retain")
  @RequirePermissions("devices.manage")
  retain() {
    return this.sync.retainHistory();
  }
}
