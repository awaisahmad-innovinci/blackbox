import { Matches } from "class-validator";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class InventoryInOutReportQueryDto {
  @Matches(ISO_DATE, { message: "dateFrom must be YYYY-MM-DD" })
  dateFrom!: string;

  @Matches(ISO_DATE, { message: "dateTo must be YYYY-MM-DD" })
  dateTo!: string;
}
