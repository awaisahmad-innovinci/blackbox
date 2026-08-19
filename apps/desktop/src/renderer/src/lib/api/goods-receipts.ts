import type {
  CreateGoodsReceiptRequest,
  GoodsReceiptDetail,
  GoodsReceiptListQuery,
  PaginatedGoodsReceipts,
  ReceivingDraft,
} from "@blackbox/shared";
import { apiFetch } from "./client";

function toQuery(params: GoodsReceiptListQuery): string {
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

export const goodsReceiptsApi = {
  list(params: GoodsReceiptListQuery = {}): Promise<PaginatedGoodsReceipts> {
    return apiFetch<PaginatedGoodsReceipts>(
      `/goods-receipts${toQuery(params)}`,
    );
  },
  getReceiving(purchaseOrderId: string): Promise<ReceivingDraft> {
    return apiFetch<ReceivingDraft>(
      `/purchase-orders/${purchaseOrderId}/receiving`,
    );
  },
  createReceipt(
    purchaseOrderId: string,
    body: CreateGoodsReceiptRequest,
  ): Promise<GoodsReceiptDetail> {
    return apiFetch<GoodsReceiptDetail>(
      `/purchase-orders/${purchaseOrderId}/receipts`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );
  },
  get(id: string): Promise<GoodsReceiptDetail> {
    return apiFetch<GoodsReceiptDetail>(`/goods-receipts/${id}`);
  },
};
