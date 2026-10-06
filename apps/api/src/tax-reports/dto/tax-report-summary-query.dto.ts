import { IsIn, IsOptional, IsUUID, Matches } from "class-validator";
import { TAX_REPORT_KINDS, type TaxReportKind } from "@blackbox/shared";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class TaxReportSummaryQueryDto {
  @Matches(ISO_DATE, { message: "dateFrom must be YYYY-MM-DD" })
  dateFrom!: string;

  @Matches(ISO_DATE, { message: "dateTo must be YYYY-MM-DD" })
  dateTo!: string;

  @IsOptional()
  @IsUUID()
  vendorId?: string;

  @IsOptional()
  @IsIn([...TAX_REPORT_KINDS])
  taxKind?: TaxReportKind;
}
