import type {
  CreateInventoryOutRequest,
  InventoryOutDetail,
  InventoryOutListQuery,
  PaginatedInventoryOuts,
} from "@blackbox/shared";
import { apiFetch } from "./client";

function toQuery(params: InventoryOutListQuery): string {
  const sp = new URLSearchParams();
  if (params.search) sp.set("search", params.search);
  if (params.warehouseId) sp.set("warehouseId", params.warehouseId);
  if (params.dateFrom) sp.set("dateFrom", params.dateFrom);
  if (params.dateTo) sp.set("dateTo", params.dateTo);
  if (params.page) sp.set("page", String(params.page));
  if (params.pageSize) sp.set("pageSize", String(params.pageSize));
  const q = sp.toString();
  return q ? `?${q}` : "";
}

export const inventoryOutApi = {
  list(params: InventoryOutListQuery = {}): Promise<PaginatedInventoryOuts> {
    return apiFetch<PaginatedInventoryOuts>(`/inventory-out${toQuery(params)}`);
  },
  create(body: CreateInventoryOutRequest): Promise<InventoryOutDetail> {
    return apiFetch<InventoryOutDetail>("/inventory-out", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  get(id: string): Promise<InventoryOutDetail> {
    return apiFetch<InventoryOutDetail>(`/inventory-out/${id}`);
  },
};
