import type {
  CreateGoodsReceiptRequest,
  GoodsReceiptDetail,
  ReceivingDraft,
} from "@blackbox/shared";
import { apiFetch } from "./client";

export const goodsReceiptsApi = {
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
