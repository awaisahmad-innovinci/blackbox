import type {
  CreateWarehouseRequest,
  TaxonomyListQuery,
  UpdateWarehouseRequest,
  WarehouseListItem,
} from "@blackbox/shared";
import { apiFetch } from "./client";

function listQuery(query?: TaxonomyListQuery): string {
  if (!query) return "";
  const params = new URLSearchParams();
  if (query.status) params.set("status", query.status);
  if (query.q?.trim()) params.set("q", query.q.trim());
  const s = params.toString();
  return s ? `?${s}` : "";
}

export const warehousesApi = {
  list(query?: TaxonomyListQuery): Promise<WarehouseListItem[]> {
    return apiFetch<WarehouseListItem[]>(`/warehouses${listQuery(query)}`);
  },
  get(id: string): Promise<WarehouseListItem> {
    return apiFetch<WarehouseListItem>(`/warehouses/${id}`);
  },
  create(body: CreateWarehouseRequest): Promise<WarehouseListItem> {
    return apiFetch<WarehouseListItem>("/warehouses", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  update(
    id: string,
    body: UpdateWarehouseRequest,
  ): Promise<WarehouseListItem> {
    return apiFetch<WarehouseListItem>(`/warehouses/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },
  deactivate(id: string): Promise<WarehouseListItem> {
    return apiFetch<WarehouseListItem>(`/warehouses/${id}/deactivate`, {
      method: "POST",
    });
  },
};
