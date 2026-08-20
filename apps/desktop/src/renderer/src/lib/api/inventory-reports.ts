import type { InventoryInOutReport } from "@blackbox/shared";
import { apiFetch } from "./client";

export const inventoryReportsApi = {
  inOut(dateFrom: string, dateTo: string): Promise<InventoryInOutReport> {
    const params = new URLSearchParams({ dateFrom, dateTo });
    return apiFetch<InventoryInOutReport>(
      `/inventory-reports/in-out?${params.toString()}`,
    );
  },
};
