/// <reference types="vite/client" />

import type {
  Brand,
  Category,
  DashboardSummary,
  EntityStatus,
  GoodsReceiptDetail,
  InventoryMovementListItem,
  InventoryOutDetail,
  PaginatedProducts,
  PaginatedPurchaseOrders,
  PaginatedVendors,
  ProductDetail,
  ProductListQuery,
  ProductSkuDetail,
  PurchaseOrderDetail,
  PurchaseOrderListQuery,
  UnitListItem,
  VendorDetail,
  VendorGroup,
  VendorListQuery,
  VendorSku,
  WarehouseListItem,
  WarehouseStockRow,
} from "@blackbox/shared";

export type LocalDbStatus =
  | {
      connected: true;
      path: string;
      migrationsApplied: number;
      latestMigration: string | null;
    }
  | {
      connected: false;
      path: string | null;
      error: string;
    };

export {};

declare global {
  interface ImportMetaEnv {
    readonly VITE_API_URL: string;
  }

  interface Window {
    blackbox?: {
      platform: NodeJS.Platform;
      localDb?: {
        getStatus: () => Promise<LocalDbStatus>;
        getSyncMeta: (key: string) => Promise<string | null>;
        setSyncMeta: (key: string, value: string) => Promise<{ ok: true }>;
        upsertBrands: (rows: Brand[]) => Promise<{ ok: true }>;
        upsertCategories: (rows: Category[]) => Promise<{ ok: true }>;
        upsertUnits: (rows: UnitListItem[]) => Promise<{ ok: true }>;
        upsertVendorGroups: (rows: VendorGroup[]) => Promise<{ ok: true }>;
        upsertWarehouses: (rows: WarehouseListItem[]) => Promise<{ ok: true }>;
        upsertProducts: (rows: ProductDetail[]) => Promise<{ ok: true }>;
        upsertProductSkus: (rows: ProductSkuDetail[]) => Promise<{ ok: true }>;
        upsertVendors: (rows: VendorDetail[]) => Promise<{ ok: true }>;
        upsertVendorSkus: (rows: VendorSku[]) => Promise<{ ok: true }>;
        upsertPurchaseOrders: (
          rows: PurchaseOrderDetail[],
        ) => Promise<{ ok: true }>;
        upsertStockRows: (rows: WarehouseStockRow[]) => Promise<{ ok: true }>;
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
        upsertGoodsReceipts: (
          rows: GoodsReceiptDetail[],
        ) => Promise<{ ok: true }>;
        upsertInventoryOut: (
          detail: InventoryOutDetail,
        ) => Promise<{ ok: true }>;
        upsertInventoryOuts: (
          rows: InventoryOutDetail[],
        ) => Promise<{ ok: true }>;
        upsertInventoryMovements: (
          rows: InventoryMovementListItem[],
        ) => Promise<{ ok: true }>;
        listProducts: (
          query?: ProductListQuery,
        ) => Promise<PaginatedProducts>;
        listVendors: (query?: VendorListQuery) => Promise<PaginatedVendors>;
        listPurchaseOrders: (
          query?: PurchaseOrderListQuery,
        ) => Promise<PaginatedPurchaseOrders>;
        getDashboardSummary: () => Promise<DashboardSummary>;
        listBrands: (status?: EntityStatus | "all") => Promise<Brand[]>;
        listCategories: (status?: EntityStatus | "all") => Promise<Category[]>;
        listVendorGroups: (
          status?: EntityStatus | "all",
        ) => Promise<VendorGroup[]>;
        listWarehouses: () => Promise<WarehouseListItem[]>;
      };
      identity?: {
        getFingerprint: () => Promise<string>;
        get: () => Promise<{
          tenantId: string;
          deviceId: string;
          instanceId: string;
        } | null>;
        bind: (identity: {
          tenantId: string;
          deviceId: string;
          instanceId: string;
        }) => Promise<{ ok: true }>;
      };
      sync?: {
        listOutbox: (limit?: number) => Promise<unknown>;
        markPushing: (ids: string[]) => Promise<{ ok: true }>;
        markAcked: (
          changeId: string,
          seq?: string,
        ) => Promise<{ ok: true }>;
        markPending: (
          changeId: string,
          error: string,
        ) => Promise<{ ok: true }>;
        markRejected: (
          changeId: string,
          error: string,
        ) => Promise<{ ok: true }>;
        pullCursor: (stream: string) => Promise<string>;
        applyPull: (payload: {
          changes: import("@blackbox/shared").SyncChangeDto[];
          nextCursor: string;
          stream: string;
        }) => Promise<{ ok: true }>;
        pendingCount: () => Promise<number>;
        enqueue: (input: unknown) => Promise<{ changeId: string }>;
        commit: (input: unknown) => Promise<{ changeId: string }>;
      };
    };
  }
}
