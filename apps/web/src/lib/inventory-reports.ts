import type { InventoryInOutReport } from "@blackbox/shared";
import { apiFetch } from "./api-client";

export function getInventoryInOutReport(
  dateFrom: string,
  dateTo: string,
): Promise<InventoryInOutReport> {
  const params = new URLSearchParams({ dateFrom, dateTo });
  return apiFetch<InventoryInOutReport>(
    `/inventory-reports/in-out?${params.toString()}`,
  );
}
