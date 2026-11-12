import type {
  Brand,
  Category,
  GoodsReceiptDetail,
  InventoryOutDetail,
  ProductDetail,
  ProductSkuDetail,
  PurchaseOrderDetail,
  SkuBarcode,
  UnitListItem,
  VendorDetail,
  VendorGroup,
  VendorReturnDetail,
  VendorSku,
  WarehouseListItem,
  WarehouseStockRow,
} from "./inventory";

export const SYNC_STREAMS = [
  "auth_snapshot",
  "master_data",
  "inventory",
  "purchasing",
] as const;

export type SyncStream = (typeof SYNC_STREAMS)[number];

export const SYNC_OPERATIONS = ["UPSERT", "DELETE", "EVENT"] as const;
export type SyncOperation = (typeof SYNC_OPERATIONS)[number];

export const SYNC_PUSH_BATCH_SIZE = 100;
export const SYNC_PULL_BATCH_SIZE = 200;
export const SYNC_CATALOG_PAGE_SIZE = 100;
export const SYNC_MAX_BODY_BYTES = 1024 * 1024;
export const SYNC_MAX_PAYLOAD_BYTES = 64 * 1024;

export const SYNC_CATALOG_SECTIONS = [
  "reference",
  "products",
  "vendors",
  "stock",
  "documents",
] as const;

export type SyncCatalogSection = (typeof SYNC_CATALOG_SECTIONS)[number];

export const SYNC_CATALOG_DOCUMENT_KINDS = [
  "purchaseOrders",
  "goodsReceipts",
  "inventoryOuts",
  "vendorReturns",
] as const;

export type SyncCatalogDocumentKind =
  (typeof SYNC_CATALOG_DOCUMENT_KINDS)[number];

export type MasterDataEntityType =
  | "unit"
  | "brand"
  | "category"
  | "warehouse"
  | "vendor_group"
  | "product"
  | "product_sku"
  | "product_sku_barcode"
  | "vendor"
  | "vendor_sku";

export type InventoryEntityType =
  | "inventory_movement"
  | "inventory_stock";

export type PurchasingEntityType =
  | "purchase_order"
  | "goods_receipt"
  | "vendor_ledger_entry"
  | "inventory_out"
  | "inventory_out_return"
  | "vendor_return"
  | "sale"
  | "sale_return"
  | "till_session"
  | "till_withdrawal"
  | "cash_expense"
  | "owner_cash_entry"
  | "manager_drawer_opening"
  | "manager_drawer_submission";

export type SyncEntityType =
  | MasterDataEntityType
  | InventoryEntityType
  | PurchasingEntityType
  | "auth_snapshot";

export interface SyncChangeInput {
  changeId: string;
  entityType: SyncEntityType;
  entityId: string;
  operation: SyncOperation;
  baseEntityVersion: number;
  payload: Record<string, unknown>;
}

export interface SyncPushRequest {
  stream: SyncStream;
  changes: SyncChangeInput[];
}

export type SyncPushItemStatus = "acked" | "duplicate" | "rejected" | "conflict";

export interface SyncPushItemResult {
  changeId: string;
  status: SyncPushItemStatus;
  seq?: string;
  message?: string;
  retryable?: boolean;
}

export interface SyncPushResponse {
  results: SyncPushItemResult[];
}

export interface SyncChangeDto {
  seq: string;
  changeId: string;
  originDeviceId: string;
  stream: SyncStream;
  entityType: SyncEntityType;
  entityId: string;
  operation: SyncOperation;
  entityVersion: number;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface SyncPullResponse {
  changes: SyncChangeDto[];
  nextCursor: string;
  hasMore: boolean;
  serverSeq: string;
}

export interface SyncStreamStatus {
  stream: SyncStream;
  serverSeq: string;
  deviceCursor: string;
  lag: number;
  pendingConflicts: number;
}

export interface SyncStatusResponse {
  tenantId: string;
  deviceId: string;
  deviceStatus: string;
  lastSyncAt: string | null;
  lastError: string | null;
  needsFullResync: boolean;
  streams: SyncStreamStatus[];
}

export interface SyncConflictAckRequest {
  conflictId: string;
  resolution: "accepted_local" | "accepted_cloud" | "merged";
}

export interface SyncEntityVersionHead {
  entityType: SyncEntityType;
  entityId: string;
  entityVersion: number;
}

export interface SyncEntityVersionHeadsResponse {
  items: SyncEntityVersionHead[];
  hasMore: boolean;
}

export interface SyncCatalogPage<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SyncCatalogReference {
  units: UnitListItem[];
  brands: Brand[];
  categories: Category[];
  vendorGroups: VendorGroup[];
  warehouses: WarehouseListItem[];
}

export interface SyncCatalogProductRow {
  product: ProductDetail;
  skus: ProductSkuDetail[];
  barcodes: SkuBarcode[];
}

export interface SyncCatalogVendorRow {
  vendor: VendorDetail;
  links: VendorSku[];
}

export type SyncCatalogStockPage = SyncCatalogPage<WarehouseStockRow>;
export type SyncCatalogPurchaseOrderPage = SyncCatalogPage<PurchaseOrderDetail>;
export type SyncCatalogGoodsReceiptPage = SyncCatalogPage<GoodsReceiptDetail>;
export type SyncCatalogInventoryOutPage = SyncCatalogPage<InventoryOutDetail>;
export type SyncCatalogVendorReturnPage = SyncCatalogPage<VendorReturnDetail>;

export function streamForEntity(entityType: SyncEntityType): SyncStream {
  if (entityType === "auth_snapshot") return "auth_snapshot";
  if (
    entityType === "inventory_movement" ||
    entityType === "inventory_stock"
  ) {
    return "inventory";
  }
  if (
    entityType === "purchase_order" ||
    entityType === "goods_receipt" ||
    entityType === "vendor_ledger_entry" ||
    entityType === "inventory_out" ||
    entityType === "inventory_out_return" ||
    entityType === "vendor_return" ||
    entityType === "sale" ||
    entityType === "sale_return" ||
    entityType === "till_session" ||
    entityType === "till_withdrawal" ||
    entityType === "cash_expense" ||
    entityType === "owner_cash_entry" ||
    entityType === "manager_drawer_opening" ||
    entityType === "manager_drawer_submission"
  ) {
    return "purchasing";
  }
  return "master_data";
}
