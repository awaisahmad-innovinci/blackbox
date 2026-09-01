import type {
  CreateProductSkuRequest,
  SkuBarcodeLookupResult,
  SkuDetail,
  SkuSearchResult,
  SkuSupplier,
  UpdateProductSkuRequest,
  WarehouseStockRow,
} from "@blackbox/shared";
import { apiFetch } from "./client";

export const skusApi = {
  search(q?: string, warehouseId?: string): Promise<SkuSearchResult[]> {
    const params = new URLSearchParams();
    if (q?.trim()) params.set("q", q.trim());
    if (warehouseId) params.set("warehouseId", warehouseId);
    const query = params.toString() ? `?${params.toString()}` : "";
    return apiFetch<SkuSearchResult[]>(`/skus${query}`);
  },
  byBarcode(barcode: string, warehouseId: string): Promise<SkuSearchResult> {
    const params = new URLSearchParams({
      barcode: barcode.trim(),
      warehouseId,
    });
    return apiFetch<SkuSearchResult>(`/skus/by-barcode?${params.toString()}`);
  },
  lookupByBarcode(barcode: string): Promise<SkuBarcodeLookupResult> {
    const params = new URLSearchParams({ barcode: barcode.trim() });
    return apiFetch<SkuBarcodeLookupResult>(
      `/skus/exists-by-barcode?${params.toString()}`,
    );
  },
  get(id: string): Promise<SkuDetail> {
    return apiFetch<SkuDetail>(`/skus/${id}`);
  },
  update(id: string, body: UpdateProductSkuRequest): Promise<SkuDetail> {
    return apiFetch<SkuDetail>(`/skus/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },
  deactivate(id: string): Promise<SkuDetail> {
    return apiFetch<SkuDetail>(`/skus/${id}/deactivate`, {
      method: "POST",
    });
  },
  listInventory(id: string): Promise<WarehouseStockRow[]> {
    return apiFetch<WarehouseStockRow[]>(`/skus/${id}/inventory`);
  },
  listVendors(id: string): Promise<SkuSupplier[]> {
    return apiFetch<SkuSupplier[]>(`/skus/${id}/vendors`);
  },
};

export type { CreateProductSkuRequest };
