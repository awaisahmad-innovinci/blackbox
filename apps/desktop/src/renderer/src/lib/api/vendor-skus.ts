import type {
  CreateVendorSkuRequest,
  UpdateVendorSkuRequest,
  VendorSku,
} from "@blackbox/shared";
import { apiFetch } from "./client";

export const vendorSkusApi = {
  listByVendor(
    vendorId: string,
    q?: string,
    warehouseId?: string,
  ): Promise<VendorSku[]> {
    const sp = new URLSearchParams();
    if (q?.trim()) sp.set("q", q.trim());
    if (warehouseId) sp.set("warehouseId", warehouseId);
    const query = sp.toString() ? `?${sp.toString()}` : "";
    return apiFetch<VendorSku[]>(`/vendors/${vendorId}/skus${query}`);
  },
  create(body: CreateVendorSkuRequest): Promise<VendorSku> {
    return apiFetch<VendorSku>("/vendor-skus", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  update(id: string, body: UpdateVendorSkuRequest): Promise<VendorSku> {
    return apiFetch<VendorSku>(`/vendor-skus/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },
  remove(id: string): Promise<{ id: string; status: string }> {
    return apiFetch<{ id: string; status: string }>(`/vendor-skus/${id}`, {
      method: "DELETE",
    });
  },
};
