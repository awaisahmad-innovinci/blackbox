import type { DashboardSummary, ManagerDashboardSummary, ManagerStockOverviewQuery, PaginatedManagerStockOverview } from "@blackbox/shared";
import { apiFetch } from "./client";

export const dashboardApi = {
  getSummary(): Promise<DashboardSummary> {
    return apiFetch<DashboardSummary>("/dashboard/summary");
  },
  getManagerSummary(): Promise<ManagerDashboardSummary> {
    return apiFetch<ManagerDashboardSummary>("/dashboard/manager-summary");
  },
  listManagerStockOverview(
    query: ManagerStockOverviewQuery = {},
  ): Promise<PaginatedManagerStockOverview> {
    const params = new URLSearchParams();
    if (query.warehouseId) params.set("warehouseId", query.warehouseId);
    if (query.q) params.set("q", query.q);
    if (query.page) params.set("page", String(query.page));
    if (query.pageSize) params.set("pageSize", String(query.pageSize));
    const qs = params.toString();
    return apiFetch<PaginatedManagerStockOverview>(
      `/dashboard/manager-stock-overview${qs ? `?${qs}` : ""}`,
    );
  },
};
