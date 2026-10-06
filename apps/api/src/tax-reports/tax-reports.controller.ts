import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import type { TaxReportSummary } from "@blackbox/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PermissionsGuard } from "../rbac/permissions.guard";
import { RequirePermissions } from "../rbac/require-permissions.decorator";
import { TaxReportSummaryQueryDto } from "./dto/tax-report-summary-query.dto";
import { TaxReportsService } from "./tax-reports.service";

@Controller("tax-reports")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TaxReportsController {
  constructor(private readonly taxReports: TaxReportsService) {}

  @Get("summary")
  @RequirePermissions("tax.reports.read")
  summary(@Query() query: TaxReportSummaryQueryDto): Promise<TaxReportSummary> {
    return this.taxReports.summary(
      query.dateFrom,
      query.dateTo,
      query.vendorId,
      query.taxKind ?? "all",
    );
  }
}
