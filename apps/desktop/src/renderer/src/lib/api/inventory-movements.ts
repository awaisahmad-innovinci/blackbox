import type {
  InventoryMovementListQuery,
  PaginatedInventoryMovements,
} from "@blackbox/shared";
import { apiFetch } from "./client";

function toQuery(params: InventoryMovementListQuery): string {
  const sp = new URLSearchParams();
  if (params.productSkuId) sp.set("productSkuId", params.productSkuId);
  if (params.warehouseId) sp.set("warehouseId", params.warehouseId);
  if (params.since) sp.set("since", params.since);
  if (params.page) sp.set("page", String(params.page));
  if (params.pageSize) sp.set("pageSize", String(params.pageSize));
  const q = sp.toString();
  return q ? `?${q}` : "";
}

export const inventoryMovementsApi = {
  list(
    params: InventoryMovementListQuery = {},
  ): Promise<PaginatedInventoryMovements> {
    return apiFetch<PaginatedInventoryMovements>(
      `/inventory-movements${toQuery(params)}`,
    );
  },
};
