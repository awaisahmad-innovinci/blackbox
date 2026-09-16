import type {
  CreateSaleRequest,
  PaginatedSales,
  SaleDetail,
  SaleListQuery,
} from "@blackbox/shared";
import { apiFetch } from "./client";

export const salesApi = {
  list(query: SaleListQuery = {}): Promise<PaginatedSales> {
    const params = new URLSearchParams();
    if (query.search?.trim()) params.set("search", query.search.trim());
    if (query.warehouseId) params.set("warehouseId", query.warehouseId);
    if (query.status) params.set("status", query.status);
    if (query.dateFrom) params.set("dateFrom", query.dateFrom);
    if (query.dateTo) params.set("dateTo", query.dateTo);
    if (query.page != null) params.set("page", String(query.page));
    if (query.pageSize != null) params.set("pageSize", String(query.pageSize));
    const q = params.toString() ? `?${params.toString()}` : "";
    return apiFetch<PaginatedSales>(`/sales${q}`);
  },
  get(id: string): Promise<SaleDetail> {
    return apiFetch<SaleDetail>(`/sales/${id}`);
  },
  create(body: CreateSaleRequest): Promise<SaleDetail> {
    return apiFetch<SaleDetail>("/sales", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  void(id: string): Promise<SaleDetail> {
    return apiFetch<SaleDetail>(`/sales/${id}/void`, { method: "POST" });
  },
};
