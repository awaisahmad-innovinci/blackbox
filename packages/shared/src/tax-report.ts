/** Reuse inventory report period UX (date / month / year). */
export type {
  InventoryInOutPeriodInput as TaxReportPeriodInput,
  InventoryInOutPeriodMode as TaxReportPeriodMode,
} from "./inventory-in-out-report-period";

export {
  DEFAULT_INVENTORY_IN_OUT_PERIOD as DEFAULT_TAX_REPORT_PERIOD,
  resolveInventoryInOutReportRange as resolveTaxReportRange,
} from "./inventory-in-out-report-period";

export const TAX_REPORT_KINDS = [
  "all",
  "gst",
  "sale_tax",
  "adv_tax",
  "sales_tax",
  "credits",
] as const;

export type TaxReportKind = (typeof TAX_REPORT_KINDS)[number];

export interface TaxReportVendorPaidRow {
  vendorId: string | null;
  vendorName: string;
  receiptCount: number;
  saleTax: number;
  advTax: number;
  gst: number;
  credits: number;
  totalTaxPaid: number;
}

export interface TaxReportMonthPaidRow {
  month: string;
  saleTax: number;
  advTax: number;
  gst: number;
  credits: number;
  totalTaxPaid: number;
  receiptCount: number;
}

export interface TaxReportPaidToVendors {
  saleTax: number;
  advTax: number;
  gst: number;
  credits: number;
  totalTaxPaid: number;
  receiptCount: number;
  byVendor: TaxReportVendorPaidRow[];
  byMonth: TaxReportMonthPaidRow[];
}

export interface TaxReportCollectedAmounts {
  gst: number;
  salesTax: number;
  total: number;
}

export interface TaxReportCollectedFromCustomers {
  gross: TaxReportCollectedAmounts;
  returns: TaxReportCollectedAmounts;
  net: TaxReportCollectedAmounts;
  saleCount: number;
  returnCount: number;
}

export interface TaxReportSummary {
  dateFrom: string;
  dateTo: string;
  taxKind: TaxReportKind;
  vendorId: string | null;
  paidToVendors: TaxReportPaidToVendors;
  collectedFromCustomers: TaxReportCollectedFromCustomers;
}
