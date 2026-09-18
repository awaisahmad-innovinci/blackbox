import type {
  ActivityLogListQuery,
  PaginatedActivityLogs,
} from "@blackbox/shared";
import { apiFetch } from "./api-client";

export function listActivityLogs(query: ActivityLogListQuery = {}) {
  const params = new URLSearchParams();
  if (query.dateFrom) params.set("dateFrom", query.dateFrom);
  if (query.dateTo) params.set("dateTo", query.dateTo);
  if (query.eventType) params.set("eventType", query.eventType);
  if (query.page != null) params.set("page", String(query.page));
  if (query.pageSize != null) params.set("pageSize", String(query.pageSize));
  const q = params.toString() ? `?${params.toString()}` : "";
  return apiFetch<PaginatedActivityLogs>(`/activity-logs${q}`);
}
