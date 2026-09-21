import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import type {
  DashboardSummary,
  ManagerDashboardSummary,
  PaginatedManagerStockOverview,
} from "@blackbox/shared";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { CurrentUser } from "../../common/current-user.decorator";
import type { TenantContext } from "../../common/tenant-context";
import { PermissionsGuard } from "../../rbac/permissions.guard";
import { RequirePermissions } from "../../rbac/require-permissions.decorator";
import { DashboardService } from "./dashboard.service";

/** Phase A: public (no JWT). Scoped via FixedTenantContext / DEV_TENANT_ID. */
@Controller("dashboard")
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get("summary")
  getSummary(): Promise<DashboardSummary> {
    return this.dashboardService.getSummary();
  }

  @Get("manager-summary")
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions("sales.read")
  getManagerSummary(
    @CurrentUser() user: TenantContext,
  ): Promise<ManagerDashboardSummary> {
    return this.dashboardService.getManagerSummary(user.userId, user.tenantId);
  }

  @Get("manager-stock-overview")
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions("sales.read")
  listManagerStockOverview(
    @CurrentUser() user: TenantContext,
    @Query("warehouseId") warehouseId?: string,
    @Query("q") q?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ): Promise<PaginatedManagerStockOverview> {
    return this.dashboardService.listManagerStockOverview(user.tenantId, {
      warehouseId: warehouseId || undefined,
      q: q || undefined,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }
}
