import { Controller, Get } from "@nestjs/common";
import type { DashboardSummary } from "@blackbox/shared";
import { DashboardService } from "./dashboard.service";

/** Phase A: public (no JWT). Scoped via FixedTenantContext / DEV_TENANT_ID. */
@Controller("dashboard")
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get("summary")
  getSummary(): Promise<DashboardSummary> {
    return this.dashboardService.getSummary();
  }
}
