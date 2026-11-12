import type { TaxReportKind, TaxReportSummary } from "@blackbox/shared";
import { apiFetch } from "./client";

export const taxReportsApi = {
  summary(options: {
    dateFrom: string;
    dateTo: string;
    vendorId?: string;
    taxKind?: TaxReportKind;
  }): Promise<TaxReportSummary> {
    const params = new URLSearchParams({
      dateFrom: options.dateFrom,
      dateTo: options.dateTo,
    });
    if (options.vendorId) params.set("vendorId", options.vendorId);
    if (options.taxKind && options.taxKind !== "all") {
      params.set("taxKind", options.taxKind);
    }
    return apiFetch<TaxReportSummary>(
      `/tax-reports/summary?${params.toString()}`,
    );
  },
};
