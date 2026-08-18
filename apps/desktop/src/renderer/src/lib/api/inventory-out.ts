import type {
  CreateInventoryOutRequest,
  InventoryOutDetail,
} from "@blackbox/shared";
import { apiFetch } from "./client";

export const inventoryOutApi = {
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
