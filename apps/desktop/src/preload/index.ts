import { contextBridge, ipcRenderer } from "electron";
import type {
  Brand,
  Category,
  DashboardSummary,
  EntityStatus,
  GoodsReceiptDetail,
  GoodsReceiptListQuery,
  InventoryInOutReport,
  InventoryMovementListItem,
  InventoryOutDetail,
  PaginatedProducts,
  PaginatedPurchaseOrders,
  PaginatedGoodsReceipts,
  PaginatedVendors,
  ProductDetail,
  ProductListQuery,
  ProductSkuDetail,
  ProductSupplierRow,
  PurchaseOrderDetail,
  PurchaseOrderListQuery,
  ReceivingDraft,
  SkuBarcodeLookupResult,
  SkuDetail,
  SkuSearchResult,
  SkuSupplier,
  StockMovementRow,
  UnitListItem,
  VendorDetail,
  VendorGroup,
  VendorListQuery,
  VendorReturnDetail,
  VendorReturnListQuery,
  PaginatedVendorReturns,
  PendingVendorReturnLine,
  VendorSku,
  WarehouseListItem,
  WarehouseStockRow,
} from "@blackbox/shared";

type LocalDbStatus =
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

type Ok = { ok: true };

contextBridge.exposeInMainWorld("blackbox", {
  platform: process.platform,
  localDb: {
    getStatus: () =>
      ipcRenderer.invoke("localDb:getStatus") as Promise<LocalDbStatus>,
    getSyncMeta: (key: string) =>
      ipcRenderer.invoke("localDb:getSyncMeta", key) as Promise<string | null>,
    setSyncMeta: (key: string, value: string) =>
      ipcRenderer.invoke("localDb:setSyncMeta", key, value) as Promise<Ok>,
    upsertBrands: (rows: Brand[]) =>
      ipcRenderer.invoke("localDb:upsertBrands", rows) as Promise<Ok>,
    upsertCategories: (rows: Category[]) =>
      ipcRenderer.invoke("localDb:upsertCategories", rows) as Promise<Ok>,
    upsertUnits: (rows: UnitListItem[]) =>
      ipcRenderer.invoke("localDb:upsertUnits", rows) as Promise<Ok>,
    upsertVendorGroups: (rows: VendorGroup[]) =>
      ipcRenderer.invoke("localDb:upsertVendorGroups", rows) as Promise<Ok>,
    upsertWarehouses: (rows: WarehouseListItem[]) =>
      ipcRenderer.invoke("localDb:upsertWarehouses", rows) as Promise<Ok>,
    upsertProducts: (rows: ProductDetail[]) =>
      ipcRenderer.invoke("localDb:upsertProducts", rows) as Promise<Ok>,
    upsertProductSkus: (rows: ProductSkuDetail[]) =>
      ipcRenderer.invoke("localDb:upsertProductSkus", rows) as Promise<Ok>,
    upsertVendors: (rows: VendorDetail[]) =>
      ipcRenderer.invoke("localDb:upsertVendors", rows) as Promise<Ok>,
    upsertVendorSkus: (rows: VendorSku[]) =>
      ipcRenderer.invoke("localDb:upsertVendorSkus", rows) as Promise<Ok>,
    upsertPurchaseOrders: (rows: PurchaseOrderDetail[]) =>
      ipcRenderer.invoke("localDb:upsertPurchaseOrders", rows) as Promise<Ok>,
    upsertStockRows: (rows: WarehouseStockRow[]) =>
      ipcRenderer.invoke("localDb:upsertStockRows", rows) as Promise<Ok>,
    upsertVendor: (detail: VendorDetail) =>
      ipcRenderer.invoke("localDb:upsertVendor", detail) as Promise<Ok>,
    upsertVendorSku: (row: VendorSku) =>
      ipcRenderer.invoke("localDb:upsertVendorSku", row) as Promise<Ok>,
    deactivateVendorSku: (id: string) =>
      ipcRenderer.invoke("localDb:deactivateVendorSku", id) as Promise<Ok>,
    upsertProduct: (detail: ProductDetail) =>
      ipcRenderer.invoke("localDb:upsertProduct", detail) as Promise<Ok>,
    upsertProductSku: (row: ProductSkuDetail) =>
      ipcRenderer.invoke("localDb:upsertProductSku", row) as Promise<Ok>,
    upsertPurchaseOrder: (detail: PurchaseOrderDetail) =>
      ipcRenderer.invoke("localDb:upsertPurchaseOrder", detail) as Promise<Ok>,
    upsertGoodsReceipt: (detail: GoodsReceiptDetail) =>
      ipcRenderer.invoke("localDb:upsertGoodsReceipt", detail) as Promise<Ok>,
    upsertGoodsReceipts: (rows: GoodsReceiptDetail[]) =>
      ipcRenderer.invoke("localDb:upsertGoodsReceipts", rows) as Promise<Ok>,
    upsertInventoryOut: (detail: InventoryOutDetail) =>
      ipcRenderer.invoke("localDb:upsertInventoryOut", detail) as Promise<Ok>,
    upsertInventoryOuts: (rows: InventoryOutDetail[]) =>
      ipcRenderer.invoke("localDb:upsertInventoryOuts", rows) as Promise<Ok>,
    upsertVendorReturn: (detail: VendorReturnDetail) =>
      ipcRenderer.invoke("localDb:upsertVendorReturn", detail) as Promise<Ok>,
    upsertVendorReturns: (rows: VendorReturnDetail[]) =>
      ipcRenderer.invoke("localDb:upsertVendorReturns", rows) as Promise<Ok>,
    upsertInventoryMovements: (rows: InventoryMovementListItem[]) =>
      ipcRenderer.invoke(
        "localDb:upsertInventoryMovements",
        rows,
      ) as Promise<Ok>,
    listProducts: (query?: ProductListQuery) =>
      ipcRenderer.invoke("localDb:listProducts", query) as Promise<PaginatedProducts>,
    listVendors: (query?: VendorListQuery) =>
      ipcRenderer.invoke("localDb:listVendors", query) as Promise<PaginatedVendors>,
    listPurchaseOrders: (query?: PurchaseOrderListQuery) =>
      ipcRenderer.invoke(
        "localDb:listPurchaseOrders",
        query,
      ) as Promise<PaginatedPurchaseOrders>,
    listGoodsReceipts: (query?: GoodsReceiptListQuery) =>
      ipcRenderer.invoke(
        "localDb:listGoodsReceipts",
        query,
      ) as Promise<PaginatedGoodsReceipts>,
    listPoNumbers: () =>
      ipcRenderer.invoke("localDb:listPoNumbers") as Promise<string[]>,
    listReceiptNumbers: () =>
      ipcRenderer.invoke("localDb:listReceiptNumbers") as Promise<string[]>,
    getDashboardSummary: () =>
      ipcRenderer.invoke(
        "localDb:getDashboardSummary",
      ) as Promise<DashboardSummary>,
    listBrands: (status?: EntityStatus | "all") =>
      ipcRenderer.invoke("localDb:listBrands", status) as Promise<Brand[]>,
    listCategories: (status?: EntityStatus | "all") =>
      ipcRenderer.invoke("localDb:listCategories", status) as Promise<Category[]>,
    listVendorGroups: (status?: EntityStatus | "all") =>
      ipcRenderer.invoke(
        "localDb:listVendorGroups",
        status,
      ) as Promise<VendorGroup[]>,
    listWarehouses: (status?: EntityStatus | "all") =>
      ipcRenderer.invoke(
        "localDb:listWarehouses",
        status,
      ) as Promise<WarehouseListItem[]>,
    getWarehouse: (id: string) =>
      ipcRenderer.invoke("localDb:getWarehouse", id) as Promise<
        WarehouseListItem | null
      >,
    listUnits: () =>
      ipcRenderer.invoke("localDb:listUnits") as Promise<UnitListItem[]>,
    getProduct: (id: string) =>
      ipcRenderer.invoke("localDb:getProduct", id) as Promise<ProductDetail | null>,
    getProductProfile: (id: string) =>
      ipcRenderer.invoke("localDb:getProductProfile", id) as Promise<{
        product: ProductDetail;
        skus: ProductSkuDetail[];
        suppliers: ProductSupplierRow[];
        inventory: WarehouseStockRow[];
        movements: StockMovementRow[];
      } | null>,
    getVendor: (id: string) =>
      ipcRenderer.invoke("localDb:getVendor", id) as Promise<VendorDetail | null>,
    getVendorProfile: (id: string) =>
      ipcRenderer.invoke("localDb:getVendorProfile", id) as Promise<{
        vendor: VendorDetail;
        skus: VendorSku[];
      } | null>,
    listVendorSkus: (vendorId: string, q?: string, warehouseId?: string) =>
      ipcRenderer.invoke(
        "localDb:listVendorSkus",
        vendorId,
        q,
        warehouseId,
      ) as Promise<VendorSku[]>,
    getSku: (id: string) =>
      ipcRenderer.invoke("localDb:getSku", id) as Promise<SkuDetail | null>,
    getVendorSku: (id: string) =>
      ipcRenderer.invoke("localDb:getVendorSku", id) as Promise<VendorSku | null>,
    applyPurchaseAvgCost: (
      productSkuId: string,
      inventoryDelta: number,
      receivingUnitCost: number,
      unitsPerPurchaseUnit: number,
    ) =>
      ipcRenderer.invoke(
        "localDb:applyPurchaseAvgCost",
        productSkuId,
        inventoryDelta,
        receivingUnitCost,
        unitsPerPurchaseUnit,
      ) as Promise<{ sku: SkuDetail; avgCost: number } | null>,
    getSkuProfile: (id: string) =>
      ipcRenderer.invoke("localDb:getSkuProfile", id) as Promise<{
        sku: SkuDetail;
        suppliers: SkuSupplier[];
        inventory: WarehouseStockRow[];
      } | null>,
    searchSkus: (q?: string, warehouseId?: string) =>
      ipcRenderer.invoke(
        "localDb:searchSkus",
        q,
        warehouseId,
      ) as Promise<SkuSearchResult[]>,
    getSkuByBarcode: (barcode: string, warehouseId: string) =>
      ipcRenderer.invoke(
        "localDb:getSkuByBarcode",
        barcode,
        warehouseId,
      ) as Promise<SkuSearchResult | null>,
    lookupSkuByBarcode: (barcode: string) =>
      ipcRenderer.invoke(
        "localDb:lookupSkuByBarcode",
        barcode,
      ) as Promise<SkuBarcodeLookupResult | null>,
    getPurchaseOrder: (id: string) =>
      ipcRenderer.invoke(
        "localDb:getPurchaseOrder",
        id,
      ) as Promise<PurchaseOrderDetail | null>,
    getReceivingDraft: (poId: string) =>
      ipcRenderer.invoke(
        "localDb:getReceivingDraft",
        poId,
      ) as Promise<ReceivingDraft | null>,
    getGoodsReceipt: (id: string) =>
      ipcRenderer.invoke(
        "localDb:getGoodsReceipt",
        id,
      ) as Promise<GoodsReceiptDetail | null>,
    getInventoryOut: (id: string) =>
      ipcRenderer.invoke(
        "localDb:getInventoryOut",
        id,
      ) as Promise<InventoryOutDetail | null>,
    listVendorReturns: (query?: VendorReturnListQuery) =>
      ipcRenderer.invoke(
        "localDb:listVendorReturns",
        query,
      ) as Promise<PaginatedVendorReturns>,
    getVendorReturn: (id: string) =>
      ipcRenderer.invoke(
        "localDb:getVendorReturn",
        id,
      ) as Promise<VendorReturnDetail | null>,
    listPendingVendorReturns: (vendorId: string) =>
      ipcRenderer.invoke(
        "localDb:listPendingVendorReturns",
        vendorId,
      ) as Promise<PendingVendorReturnLine[]>,
    lastPurchaseCost: (vendorId: string, productSkuId: string) =>
      ipcRenderer.invoke(
        "localDb:lastPurchaseCost",
        vendorId,
        productSkuId,
      ) as Promise<number>,
    inventoryInOutReport: (dateFrom: string, dateTo: string) =>
      ipcRenderer.invoke(
        "localDb:inventoryInOutReport",
        dateFrom,
        dateTo,
      ) as Promise<InventoryInOutReport>,
  },
  identity: {
    getFingerprint: () =>
      ipcRenderer.invoke("identity:getFingerprint") as Promise<string>,
    get: () =>
      ipcRenderer.invoke("identity:get") as Promise<{
        tenantId: string;
        deviceId: string;
        instanceId: string;
      } | null>,
    bind: (identity: {
      tenantId: string;
      deviceId: string;
      instanceId: string;
    }) => ipcRenderer.invoke("identity:bind", identity) as Promise<{ ok: true }>,
  },
  sync: {
    listOutbox: (limit?: number) => ipcRenderer.invoke("sync:listOutbox", limit),
    markPushing: (ids: string[]) =>
      ipcRenderer.invoke("sync:markPushing", ids) as Promise<{ ok: true }>,
    markAcked: (changeId: string, seq?: string) =>
      ipcRenderer.invoke("sync:markAcked", changeId, seq) as Promise<{
        ok: true;
      }>,
    markPending: (changeId: string, error: string) =>
      ipcRenderer.invoke("sync:markPending", changeId, error) as Promise<{
        ok: true;
      }>,
    markRejected: (changeId: string, error: string) =>
      ipcRenderer.invoke("sync:markRejected", changeId, error) as Promise<{
        ok: true;
      }>,
    pullCursor: (stream: string) =>
      ipcRenderer.invoke("sync:pullCursor", stream) as Promise<string>,
    applyPull: (payload: {
      changes: import("@blackbox/shared").SyncChangeDto[];
      nextCursor: string;
      stream: string;
    }) => ipcRenderer.invoke("sync:applyPull", payload) as Promise<{ ok: true }>,
    pendingCount: () =>
      ipcRenderer.invoke("sync:pendingCount") as Promise<number>,
    enqueue: (input: unknown) =>
      ipcRenderer.invoke("sync:enqueue", input) as Promise<{ changeId: string }>,
    commit: (input: unknown) =>
      ipcRenderer.invoke("sync:commit", input) as Promise<{ changeId: string }>,
  },
});
