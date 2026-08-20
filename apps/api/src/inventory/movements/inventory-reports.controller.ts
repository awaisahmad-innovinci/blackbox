import { Controller, Get, Query } from "@nestjs/common";
import type { InventoryInOutReport } from "@blackbox/shared";
import { InventoryInOutReportQueryDto } from "./dto/inventory-in-out-report-query.dto";
import { InventoryMovementsService } from "./inventory-movements.service";

@Controller("inventory-reports")
export class InventoryReportsController {
  constructor(private readonly movements: InventoryMovementsService) {}

  @Get("in-out")
  inOut(
    @Query() query: InventoryInOutReportQueryDto,
  ): Promise<InventoryInOutReport> {
    return this.movements.inOutReport(query.dateFrom, query.dateTo);
  }
}
