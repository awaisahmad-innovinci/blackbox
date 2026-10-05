import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import type { InventoryInOutReport } from "@blackbox/shared";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { PermissionsGuard } from "../../rbac/permissions.guard";
import { RequirePermissions } from "../../rbac/require-permissions.decorator";
import { InventoryInOutReportQueryDto } from "./dto/inventory-in-out-report-query.dto";
import { InventoryMovementsService } from "./inventory-movements.service";

@Controller("inventory-reports")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class InventoryReportsController {
  constructor(private readonly movements: InventoryMovementsService) {}

  @Get("in-out")
  @RequirePermissions("inventory.access")
  inOut(
    @Query() query: InventoryInOutReportQueryDto,
  ): Promise<InventoryInOutReport> {
    return this.movements.inOutReport(query.dateFrom, query.dateTo);
  }
}
