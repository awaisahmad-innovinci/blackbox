import type { DashboardSummary } from "@blackbox/shared";
import { apiFetch } from "./client";

export const dashboardApi = {
  getSummary(): Promise<DashboardSummary> {
    return apiFetch<DashboardSummary>("/dashboard/summary");
  },
};
