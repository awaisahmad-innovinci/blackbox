import { Module } from "@nestjs/common";
import { TaxReportsController } from "./tax-reports.controller";
import { TaxReportsService } from "./tax-reports.service";
import { PermissionsService } from "src/rbac/permissions.service";

@Module({
  controllers: [TaxReportsController],
  providers: [TaxReportsService,PermissionsService],
})
export class TaxReportsModule {}
