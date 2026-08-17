import { Body, Controller, Get, Patch, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import type { TenantContext } from "../common/tenant-context";
import { PermissionsGuard } from "../rbac/permissions.guard";
import { RequirePermissions } from "../rbac/require-permissions.decorator";
import { OnboardingBusinessDto } from "./dto/onboarding-business.dto";
import { OnboardingLocationDto } from "./dto/onboarding-location.dto";
import { UpdateTenantDto } from "./dto/update-tenant.dto";
import { TenantsService } from "./tenants.service";

@Controller("tenants")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get("current")
  @RequirePermissions("tenant.settings.read")
  getCurrent(@CurrentUser() user: TenantContext) {
    return this.tenantsService.getCurrent(user.tenantId);
  }

  @Patch("current")
  @RequirePermissions("tenant.settings.write")
  updateCurrent(
    @CurrentUser() user: TenantContext,
    @Body() dto: UpdateTenantDto,
  ) {
    return this.tenantsService.updateCurrent(user.tenantId, dto);
  }

  @Patch("current/onboarding/business")
  @RequirePermissions("tenant.settings.write")
  saveOnboardingBusiness(
    @CurrentUser() user: TenantContext,
    @Body() dto: OnboardingBusinessDto,
  ) {
    return this.tenantsService.saveOnboardingBusiness(user.tenantId, dto);
  }

  @Post("current/onboarding/location")
  @RequirePermissions("tenant.settings.write")
  completeOnboardingLocation(
    @CurrentUser() user: TenantContext,
    @Body() dto: OnboardingLocationDto,
  ) {
    return this.tenantsService.completeOnboardingLocation(user.tenantId, dto);
  }
}
