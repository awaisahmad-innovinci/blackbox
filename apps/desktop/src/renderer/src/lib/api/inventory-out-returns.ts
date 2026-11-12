import type {
  CreateInventoryOutReturnRequest,
  InventoryOutReturnDetail,
  InventoryOutReturnListQuery,
  PaginatedInventoryOutReturns,
} from "@blackbox/shared";
import { apiFetch } from "./client";

function toQuery(params: InventoryOutReturnListQuery): string {
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

export const inventoryOutReturnsApi = {
  list(
    params: InventoryOutReturnListQuery = {},
  ): Promise<PaginatedInventoryOutReturns> {
    return apiFetch<PaginatedInventoryOutReturns>(
      `/inventory-out-returns${toQuery(params)}`,
    );
  },
  create(body: CreateInventoryOutReturnRequest): Promise<InventoryOutReturnDetail> {
    return apiFetch<InventoryOutReturnDetail>("/inventory-out-returns", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  get(id: string): Promise<InventoryOutReturnDetail> {
    return apiFetch<InventoryOutReturnDetail>(`/inventory-out-returns/${id}`);
  },
  returnableQuantity(
    warehouseId: string,
    productSkuId: string,
  ): Promise<{ quantityAvailable: number }> {
    const sp = new URLSearchParams({ warehouseId, productSkuId });
    return apiFetch<{ quantityAvailable: number }>(
      `/inventory-out-returns/returnable-quantity?${sp.toString()}`,
    );
  },
};
