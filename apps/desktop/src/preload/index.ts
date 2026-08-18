import { contextBridge, ipcRenderer } from "electron";
import type {
  GoodsReceiptDetail,
  ProductDetail,
  ProductSkuDetail,
  PurchaseOrderDetail,
  VendorDetail,
  VendorSku,
} from "@blackbox/shared";

contextBridge.exposeInMainWorld("blackbox", {
  platform: process.platform,
  localDb: {
    upsertVendor: (detail: VendorDetail) =>
      ipcRenderer.invoke("localDb:upsertVendor", detail) as Promise<{ ok: true }>,
    upsertVendorSku: (row: VendorSku) =>
      ipcRenderer.invoke("localDb:upsertVendorSku", row) as Promise<{ ok: true }>,
    deactivateVendorSku: (id: string) =>
      ipcRenderer.invoke("localDb:deactivateVendorSku", id) as Promise<{
        ok: true;
      }>,
    upsertProduct: (detail: ProductDetail) =>
      ipcRenderer.invoke("localDb:upsertProduct", detail) as Promise<{
        ok: true;
      }>,
    upsertProductSku: (row: ProductSkuDetail) =>
      ipcRenderer.invoke("localDb:upsertProductSku", row) as Promise<{
        ok: true;
      }>,
    upsertPurchaseOrder: (detail: PurchaseOrderDetail) =>
      ipcRenderer.invoke("localDb:upsertPurchaseOrder", detail) as Promise<{
        ok: true;
      }>,
    upsertGoodsReceipt: (detail: GoodsReceiptDetail) =>
      ipcRenderer.invoke("localDb:upsertGoodsReceipt", detail) as Promise<{
        ok: true;
      }>,
  },
});
