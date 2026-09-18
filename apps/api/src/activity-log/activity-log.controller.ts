import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import type {
  ActivityLogItem,
  PaginatedActivityLogs,
} from "@blackbox/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { TenantContext } from "../common/tenant-context";
import { CurrentUser } from "../common/current-user.decorator";
import { PermissionsGuard } from "../rbac/permissions.guard";
import { RequirePermissions } from "../rbac/require-permissions.decorator";
import { ActivityLogService } from "./activity-log.service";
import {
  CreateActivityLogDto,
  ListActivityLogsQueryDto,
} from "./dto/activity-log.dto";

@Controller("activity-logs")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ActivityLogController {
  constructor(private readonly activityLog: ActivityLogService) {}

  @Get()
  @RequirePermissions("activity.read")
  list(@Query() query: ListActivityLogsQueryDto): Promise<PaginatedActivityLogs> {
    return this.activityLog.list(query);
  }

  @Post()
  @RequirePermissions("sales.write")
  create(
    @Body() dto: CreateActivityLogDto,
    @CurrentUser() user: TenantContext,
  ): Promise<ActivityLogItem> {
    return this.activityLog.create(user, dto);
  }
}
