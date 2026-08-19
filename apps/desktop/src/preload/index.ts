import { contextBridge, ipcRenderer } from "electron";
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
    listWarehouses: () =>
      ipcRenderer.invoke(
        "localDb:listWarehouses",
      ) as Promise<WarehouseListItem[]>,
  },
});
