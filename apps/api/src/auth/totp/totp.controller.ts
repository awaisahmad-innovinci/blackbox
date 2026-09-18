import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from "@nestjs/common";
import type {
  TotpEnrollStartResponse,
  TotpStatusResponse,
  TotpSupervisorCacheResponse,
} from "@blackbox/shared";
import { CurrentUser } from "../../common/current-user.decorator";
import type { TenantContext } from "../../common/tenant-context";
import { PermissionsGuard } from "../../rbac/permissions.guard";
import { RequirePermissions } from "../../rbac/require-permissions.decorator";
import { JwtAuthGuard } from "../jwt-auth.guard";
import { TotpEnrollConfirmDto } from "./dto/totp-enroll-confirm.dto";
import { TotpService } from "./totp.service";

@Controller("auth/totp")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TotpController {
  constructor(private readonly totp: TotpService) {}

  @Get("status")
  status(@CurrentUser() user: TenantContext): Promise<TotpStatusResponse> {
    return this.totp.status(user.userId, user.tenantId);
  }

  @Post("enroll/start")
  enrollStart(
    @CurrentUser() user: TenantContext,
  ): Promise<TotpEnrollStartResponse> {
    return this.totp.enrollStart(user.userId, user.tenantId);
  }

  @Post("enroll/confirm")
  @HttpCode(200)
  enrollConfirm(
    @CurrentUser() user: TenantContext,
    @Body() dto: TotpEnrollConfirmDto,
  ): Promise<TotpStatusResponse> {
    return this.totp.enrollConfirm(user.userId, user.tenantId, dto.code);
  }

  @Delete()
  @HttpCode(200)
  resetSelf(@CurrentUser() user: TenantContext): Promise<{ ok: true }> {
    return this.totp.reset(user.userId, user.tenantId, user.userId, false);
  }

  @Delete("users/:userId")
  @RequirePermissions("users.write")
  @HttpCode(200)
  resetUser(
    @CurrentUser() user: TenantContext,
    @Param("userId", ParseUUIDPipe) userId: string,
  ): Promise<{ ok: true }> {
    return this.totp.reset(userId, user.tenantId, user.userId, true);
  }

  /** Trusted desktop: refresh local supervisor TOTP cache for offline sale overrides. */
  @Get("supervisor-cache")
  @RequirePermissions("sync.use")
  async supervisorCache(
    @CurrentUser() user: TenantContext,
  ): Promise<TotpSupervisorCacheResponse> {
    const entries = await this.totp.listSupervisorSecretsForDevice(
      user.tenantId,
    );
    return { entries };
  }
}
