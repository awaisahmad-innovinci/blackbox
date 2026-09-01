import type {
  CreateVendorReturnRequest,
  PaginatedVendorReturns,
  PendingVendorReturnLine,
  VendorReturnDetail,
  VendorReturnListQuery,
} from "@blackbox/shared";
import { apiFetch } from "./client";

function toQuery(params: VendorReturnListQuery): string {
  const sp = new URLSearchParams();
  if (params.search) sp.set("search", params.search);
  if (params.vendorId) sp.set("vendorId", params.vendorId);
  if (params.warehouseId) sp.set("warehouseId", params.warehouseId);
  if (params.status) sp.set("status", params.status);
  if (params.dateFrom) sp.set("dateFrom", params.dateFrom);
  if (params.dateTo) sp.set("dateTo", params.dateTo);
  if (params.page) sp.set("page", String(params.page));
  if (params.pageSize) sp.set("pageSize", String(params.pageSize));
  const q = sp.toString();
  return q ? `?${q}` : "";
}

export const vendorReturnsApi = {
  list(params: VendorReturnListQuery = {}): Promise<PaginatedVendorReturns> {
    return apiFetch<PaginatedVendorReturns>(`/vendor-returns${toQuery(params)}`);
  },
  create(body: CreateVendorReturnRequest): Promise<VendorReturnDetail> {
    return apiFetch<VendorReturnDetail>("/vendor-returns", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  get(id: string): Promise<VendorReturnDetail> {
    return apiFetch<VendorReturnDetail>(`/vendor-returns/${id}`);
  },
  pending(vendorId: string): Promise<PendingVendorReturnLine[]> {
    return apiFetch<PendingVendorReturnLine[]>(
      `/vendor-returns/pending?vendorId=${encodeURIComponent(vendorId)}`,
    );
  },
  lastPurchaseCost(
    vendorId: string,
    productSkuId: string,
  ): Promise<{ unitCost: number }> {
    const sp = new URLSearchParams({ vendorId, productSkuId });
    return apiFetch<{ unitCost: number }>(
      `/vendor-returns/last-purchase-cost?${sp.toString()}`,
    );
  },
};
