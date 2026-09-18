import type {
  CreateSaleReturnRequest,
  PaginatedSaleReturns,
  ReturnableSaleLine,
  SaleReturnDetail,
  SaleReturnListQuery,
} from "@blackbox/shared";
import { apiFetch } from "./client";

export const saleReturnsApi = {
  list(query: SaleReturnListQuery = {}): Promise<PaginatedSaleReturns> {
    const params = new URLSearchParams();
    if (query.search?.trim()) params.set("search", query.search.trim());
    if (query.warehouseId) params.set("warehouseId", query.warehouseId);
    if (query.saleId) params.set("saleId", query.saleId);
    if (query.dateFrom) params.set("dateFrom", query.dateFrom);
    if (query.dateTo) params.set("dateTo", query.dateTo);
    if (query.hasFoc != null) params.set("hasFoc", String(query.hasFoc));
    if (query.page != null) params.set("page", String(query.page));
    if (query.pageSize != null) params.set("pageSize", String(query.pageSize));
    const q = params.toString() ? `?${params.toString()}` : "";
    return apiFetch<PaginatedSaleReturns>(`/sale-returns${q}`);
  },
  get(id: string): Promise<SaleReturnDetail> {
    return apiFetch<SaleReturnDetail>(`/sale-returns/${id}`);
  },
  returnableLines(saleId: string): Promise<ReturnableSaleLine[]> {
    return apiFetch<ReturnableSaleLine[]>(
      `/sale-returns/returnable-lines/${saleId}`,
    );
  },
  create(body: CreateSaleReturnRequest): Promise<SaleReturnDetail> {
    return apiFetch<SaleReturnDetail>("/sale-returns", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
};
