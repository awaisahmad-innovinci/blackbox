import {
  Controller,
  ForbiddenException,
  Get,
  Query,
  UseGuards,
} from "@nestjs/common";
import type {
  DashboardSummary,
  ManagerDashboardSummary,
  PaginatedManagerStockOverview,
} from "@blackbox/shared";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { CurrentUser } from "../../common/current-user.decorator";
import type { TenantContext } from "../../common/tenant-context";
import { PermissionsGuard } from "../../rbac/permissions.guard";
import { PermissionsService } from "../../rbac/permissions.service";
import { RequirePermissions } from "../../rbac/require-permissions.decorator";
import { DashboardService } from "./dashboard.service";

function parseOptionalNonNegativeNumber(
  value: string | undefined,
): number | undefined {
  if (value == null || value.trim() === "") return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}

/** Phase A: public (no JWT). Scoped via FixedTenantContext / DEV_TENANT_ID. */
@Controller("dashboard")
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly permissionsService: PermissionsService,
  ) {}

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
  @UseGuards(JwtAuthGuard)
  async listManagerStockOverview(
    @CurrentUser() user: TenantContext,
    @Query("warehouseId") warehouseId?: string,
    @Query("q") q?: string,
    @Query("product") product?: string,
    @Query("sku") sku?: string,
    @Query("floorQtyAtMost") floorQtyAtMost?: string,
    @Query("warehouseQtyAtMost") warehouseQtyAtMost?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ): Promise<PaginatedManagerStockOverview> {
    const effective = await this.permissionsService.getPermissionsForUser(
      user.userId,
      user.tenantId,
    );
    if (
      !effective.includes("sales.read") &&
      !effective.includes("inventory.access")
    ) {
      throw new ForbiddenException("Insufficient permissions");
    }

    return this.dashboardService.listManagerStockOverview(user.tenantId, {
      warehouseId: warehouseId || undefined,
      q: q || undefined,
      product: product || undefined,
      sku: sku || undefined,
      floorQtyAtMost: parseOptionalNonNegativeNumber(floorQtyAtMost),
      warehouseQtyAtMost: parseOptionalNonNegativeNumber(warehouseQtyAtMost),
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }
}
