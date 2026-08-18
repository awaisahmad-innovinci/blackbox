import type {
  CreatePurchaseOrderRequest,
  PaginatedPurchaseOrders,
  PurchaseOrderDetail,
  PurchaseOrderListQuery,
  UpdatePurchaseOrderItemPriceRequest,
  UpdatePurchaseOrderRequest,
} from "@blackbox/shared";
import { apiFetch } from "./client";

function toQuery(params: PurchaseOrderListQuery): string {
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

export const purchaseOrdersApi = {
  list(params: PurchaseOrderListQuery = {}): Promise<PaginatedPurchaseOrders> {
    return apiFetch<PaginatedPurchaseOrders>(
      `/purchase-orders${toQuery(params)}`,
    );
  },
  get(id: string): Promise<PurchaseOrderDetail> {
    return apiFetch<PurchaseOrderDetail>(`/purchase-orders/${id}`);
  },
  create(body: CreatePurchaseOrderRequest): Promise<PurchaseOrderDetail> {
    return apiFetch<PurchaseOrderDetail>("/purchase-orders", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  update(
    id: string,
    body: UpdatePurchaseOrderRequest,
  ): Promise<PurchaseOrderDetail> {
    return apiFetch<PurchaseOrderDetail>(`/purchase-orders/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },
  updateItemPrice(
    id: string,
    itemId: string,
    body: UpdatePurchaseOrderItemPriceRequest,
  ): Promise<PurchaseOrderDetail> {
    return apiFetch<PurchaseOrderDetail>(
      `/purchase-orders/${id}/items/${itemId}/price`,
      {
        method: "PATCH",
        body: JSON.stringify(body),
      },
    );
  },
  submit(id: string): Promise<PurchaseOrderDetail> {
    return apiFetch<PurchaseOrderDetail>(`/purchase-orders/${id}/submit`, {
      method: "POST",
    });
  },
  cancel(id: string): Promise<PurchaseOrderDetail> {
    return apiFetch<PurchaseOrderDetail>(`/purchase-orders/${id}/cancel`, {
      method: "POST",
    });
  },
};
