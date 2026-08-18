/// <reference types="vite/client" />

import type {
  GoodsReceiptDetail,
  ProductDetail,
  ProductSkuDetail,
  PurchaseOrderDetail,
  VendorDetail,
  VendorSku,
} from "@blackbox/shared";

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

export {};

declare global {
  interface Window {
    blackbox?: {
      platform: NodeJS.Platform;
      localDb?: {
        upsertVendor: (detail: VendorDetail) => Promise<{ ok: true }>;
        upsertVendorSku: (row: VendorSku) => Promise<{ ok: true }>;
        deactivateVendorSku: (id: string) => Promise<{ ok: true }>;
        upsertProduct: (detail: ProductDetail) => Promise<{ ok: true }>;
        upsertProductSku: (row: ProductSkuDetail) => Promise<{ ok: true }>;
        upsertPurchaseOrder: (
          detail: PurchaseOrderDetail,
        ) => Promise<{ ok: true }>;
        upsertGoodsReceipt: (
          detail: GoodsReceiptDetail,
        ) => Promise<{ ok: true }>;
      };
    };
  }
}
