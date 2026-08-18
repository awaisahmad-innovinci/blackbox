import type { WarehouseListItem } from "@blackbox/shared";
import { apiFetch } from "./client";

export const warehousesApi = {
  list(): Promise<WarehouseListItem[]> {
    return apiFetch<WarehouseListItem[]>("/warehouses");
  },
};
