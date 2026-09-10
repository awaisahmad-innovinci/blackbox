import type {
  GoodsReceiptDetail,
  GoodsReceiptListQuery,
  InventoryInOutReport,
  InventoryOutDetail,
  InventoryOutListQuery,
  PaginatedInventoryOuts,
  PaginatedVendors,
  ProductDetail,
  ProductSkuDetail,
  ProductSupplierRow,
  PurchaseOrderDetail,
  ReceivingDraft,
  SkuBarcodeLookupResult,
  SkuDetail,
  SkuSearchResult,
  SkuSupplier,
  StockMovementRow,
  Brand,
  Category,
  EntityStatus,
  UnitListItem,
  VendorDetail,
  VendorListQuery,
  VendorReturnDetail,
  VendorReturnListQuery,
  PaginatedVendorReturns,
  PaginatedGoodsReceipts,
  PaginatedProducts,
  PendingVendorReturnLine,
  ProductListQuery,
  VendorSku,
  WarehouseListItem,
  WarehouseStockRow,
} from "@blackbox/shared";
import { ApiError } from "@renderer/lib/api/client";
import { goodsReceiptsApi } from "@renderer/lib/api/goods-receipts";
import { inventoryReportsApi } from "@renderer/lib/api/inventory-reports";
import { inventoryOutApi } from "@renderer/lib/api/inventory-out";
import { productsApi } from "@renderer/lib/api/products";
import { purchaseOrdersApi } from "@renderer/lib/api/purchase-orders";
import { brandsApi } from "@renderer/lib/api/brands";
import { categoriesApi } from "@renderer/lib/api/categories";
import { skusApi } from "@renderer/lib/api/skus";
import { unitsApi } from "@renderer/lib/api/units";
import { vendorSkusApi } from "@renderer/lib/api/vendor-skus";
import { vendorReturnsApi } from "@renderer/lib/api/vendor-returns";
import { vendorsApi } from "@renderer/lib/api/vendors";
import { warehousesApi } from "@renderer/lib/api/warehouses";
import { resolveDataSourceMode } from "@renderer/lib/local-db/data-source";

export type ProductProfileData = {
  product: ProductDetail;
  skus: ProductSkuDetail[];
  suppliers: ProductSupplierRow[];
  inventory: WarehouseStockRow[];
  movements: StockMovementRow[];
};

export type VendorProfileData = {
  vendor: VendorDetail;
  skus: VendorSku[];
};

export type SkuProfileData = {
  sku: SkuDetail;
  suppliers: SkuSupplier[];
  inventory: WarehouseStockRow[];
};

function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

async function relatedOrEmpty<T>(promise: Promise<T[]>): Promise<T[]> {
  try {
    return await promise;
  } catch (error: unknown) {
    if (isNotFound(error)) return [];
    throw error;
  }
}

export async function loadProduct(id: string): Promise<ProductDetail> {
  const local = await window.blackbox?.localDb?.getProduct(id);
  if (local) return local;
  return productsApi.get(id);
}

export async function loadProducts(
  query: ProductListQuery = {},
): Promise<PaginatedProducts> {
  const mode = await resolveDataSourceMode();
  if (mode === "local" && window.blackbox?.localDb?.listProducts) {
    return window.blackbox.localDb.listProducts(query);
  }
  return productsApi.list(query);
}

export async function loadProductProfile(
  id: string,
): Promise<ProductProfileData> {
  const local = await window.blackbox?.localDb?.getProductProfile(id);
  if (local) return local;

  const product = await productsApi.get(id);
  const [skus, suppliers, inventory, movements] = await Promise.all([
    relatedOrEmpty(productsApi.listSkus(id)),
    relatedOrEmpty(productsApi.listSuppliers(id)),
    relatedOrEmpty(productsApi.listInventory(id)),
    relatedOrEmpty(productsApi.listMovements(id)),
  ]);
  return { product, skus, suppliers, inventory, movements };
}

export async function loadVendor(id: string): Promise<VendorDetail> {
  const local = await window.blackbox?.localDb?.getVendor(id);
  if (local) return local;
  return vendorsApi.get(id);
}

export async function loadVendorProfile(
  id: string,
): Promise<VendorProfileData> {
  const local = await window.blackbox?.localDb?.getVendorProfile(id);
  if (local) return local;

  const vendor = await vendorsApi.get(id);
  const skus = await relatedOrEmpty(vendorSkusApi.listByVendor(id));
  return { vendor, skus };
}

export async function loadSkuProfile(id: string): Promise<SkuProfileData> {
  const local = await window.blackbox?.localDb?.getSkuProfile(id);
  if (local) return local;

  const sku = await skusApi.get(id);
  const [suppliers, inventory] = await Promise.all([
    relatedOrEmpty(skusApi.listVendors(id)),
    relatedOrEmpty(skusApi.listInventory(id)),
  ]);
  return { sku, suppliers, inventory };
}

export async function loadPurchaseOrder(
  id: string,
): Promise<PurchaseOrderDetail> {
  const local = await window.blackbox?.localDb?.getPurchaseOrder(id);
  if (local) return local;
  return purchaseOrdersApi.get(id);
}

export async function loadReceivingDraft(poId: string): Promise<ReceivingDraft> {
  const local = await window.blackbox?.localDb?.getReceivingDraft(poId);
  if (local) return local;
  return goodsReceiptsApi.getReceiving(poId);
}

export async function loadGoodsReceipt(id: string): Promise<GoodsReceiptDetail> {
  const local = await window.blackbox?.localDb?.getGoodsReceipt(id);
  if (local) return local;
  return goodsReceiptsApi.get(id);
}

export async function loadGoodsReceipts(
  query: GoodsReceiptListQuery = {},
): Promise<PaginatedGoodsReceipts> {
  const mode = await resolveDataSourceMode();
  if (mode === "local" && window.blackbox?.localDb?.listGoodsReceipts) {
    return window.blackbox.localDb.listGoodsReceipts(query);
  }
  return goodsReceiptsApi.list(query);
}

export async function loadInventoryOut(id: string): Promise<InventoryOutDetail> {
  const local = await window.blackbox?.localDb?.getInventoryOut(id);
  if (local) return local;
  return inventoryOutApi.get(id);
}

export async function loadInventoryOuts(
  query: InventoryOutListQuery = {},
): Promise<PaginatedInventoryOuts> {
  const mode = await resolveDataSourceMode();
  if (mode === "local" && window.blackbox?.localDb?.listInventoryOuts) {
    return window.blackbox.localDb.listInventoryOuts(query);
  }
  return inventoryOutApi.list(query);
}

export async function loadVendorReturns(
  query: VendorReturnListQuery = {},
): Promise<PaginatedVendorReturns> {
  try {
    const local = await window.blackbox?.localDb?.listVendorReturns?.(query);
    if (local) return local;
  } catch {
    /* fall through */
  }
  return vendorReturnsApi.list(query);
}

export async function loadVendorReturn(
  id: string,
): Promise<VendorReturnDetail> {
  const local = await window.blackbox?.localDb?.getVendorReturn(id);
  if (local) return local;
  return vendorReturnsApi.get(id);
}

export async function loadPendingVendorReturns(
  vendorId: string,
): Promise<PendingVendorReturnLine[]> {
  try {
    const local =
      await window.blackbox?.localDb?.listPendingVendorReturns?.(vendorId);
    if (local) return local;
  } catch {
    /* fall through */
  }
  return vendorReturnsApi.pending(vendorId);
}

export async function loadLastPurchaseCost(
  vendorId: string,
  productSkuId: string,
): Promise<number> {
  try {
    const local = await window.blackbox?.localDb?.lastPurchaseCost?.(
      vendorId,
      productSkuId,
    );
    if (local != null) return local;
  } catch {
    /* fall through */
  }
  const remote = await vendorReturnsApi.lastPurchaseCost(vendorId, productSkuId);
  return remote.unitCost;
}

export async function loadVendorReturnableQuantity(
  vendorId: string,
  productSkuId: string,
  warehouseId: string,
): Promise<number> {
  try {
    const local = await window.blackbox?.localDb?.vendorReturnableQuantity?.(
      vendorId,
      productSkuId,
      warehouseId,
    );
    if (local != null) return local;
  } catch {
    /* fall through */
  }
  const remote = await vendorReturnsApi.returnableQuantity(
    vendorId,
    productSkuId,
    warehouseId,
  );
  return remote.quantityAvailable;
}

async function withReturnableQty(
  row: VendorSku,
  vendorId: string,
  warehouseId: string,
): Promise<VendorSku> {
  const quantityAvailable = await loadVendorReturnableQuantity(
    vendorId,
    row.productSkuId,
    warehouseId,
  );
  return { ...row, quantityAvailable };
}

export async function loadVendors(
  query: VendorListQuery = {},
): Promise<PaginatedVendors> {
  const q: VendorListQuery = { status: "active", ...query };
  try {
    const local = await window.blackbox?.localDb?.listVendors?.(q);
    if (local) return local;
  } catch {
    /* fall through to API */
  }
  return vendorsApi.list(q);
}

export async function loadWarehouses(
  status: EntityStatus | "all" = "active",
): Promise<WarehouseListItem[]> {
  try {
    const local = await window.blackbox?.localDb?.listWarehouses?.(status);
    if (local) return local;
  } catch {
    /* fall through to API */
  }
  return warehousesApi.list({ status });
}

export async function loadWarehouse(id: string): Promise<WarehouseListItem> {
  const local = await window.blackbox?.localDb?.getWarehouse?.(id);
  if (local) return local;
  return warehousesApi.get(id);
}

export async function loadBrands(
  status: EntityStatus | "all" = "active",
): Promise<Brand[]> {
  try {
    const local = await window.blackbox?.localDb?.listBrands?.(status);
    if (local) return local;
  } catch {
    /* fall through to API */
  }
  return brandsApi.list({ status });
}

export async function loadCategories(
  status: EntityStatus | "all" = "active",
): Promise<Category[]> {
  try {
    const local = await window.blackbox?.localDb?.listCategories?.(status);
    if (local) return local;
  } catch {
    /* fall through to API */
  }
  return categoriesApi.list({ status });
}

export async function loadUnits(): Promise<UnitListItem[]> {
  try {
    const local = await window.blackbox?.localDb?.listUnits?.();
    if (local) return local;
  } catch {
    /* fall through to API */
  }
  return unitsApi.list();
}

export async function loadVendorSkus(
  vendorId: string,
  q?: string,
  warehouseId?: string,
): Promise<VendorSku[]> {
  const mode = await resolveDataSourceMode();
  if (mode === "local" && window.blackbox?.localDb?.listVendorSkus) {
    return window.blackbox.localDb.listVendorSkus(vendorId, q, warehouseId);
  }
  return vendorSkusApi.listByVendor(vendorId, q, warehouseId);
}

export async function loadSkuSearch(
  q?: string,
  warehouseId?: string,
): Promise<SkuSearchResult[]> {
  const mode = await resolveDataSourceMode();
  if (mode === "local" && window.blackbox?.localDb?.searchSkus) {
    return window.blackbox.localDb.searchSkus(q, warehouseId);
  }
  return skusApi.search(q, warehouseId);
}

export type VendorSkuBarcodeLookup =
  | { kind: "found"; row: VendorSku; scannedQuantityMultiplier: number }
  | { kind: "not_found" }
  | { kind: "not_linked" };

export async function findVendorSkuByBarcode(
  vendorId: string,
  barcode: string,
  warehouseId?: string,
): Promise<VendorSkuBarcodeLookup> {
  const code = barcode.trim();
  if (!code) return { kind: "not_found" };
  const sku = await lookupSkuByBarcode(code);
  if (!sku) return { kind: "not_found" };
  const rows = await loadVendorSkus(vendorId, undefined, warehouseId);
  const match = rows.find((r) => r.productSkuId === sku.id);
  if (!match) return { kind: "not_linked" };
  return {
    kind: "found",
    row: match,
    scannedQuantityMultiplier: sku.scannedQuantityMultiplier ?? 1,
  };
}

export async function loadSkuSuppliers(
  productSkuId: string,
): Promise<SkuSupplier[]> {
  const profile = await loadSkuProfile(productSkuId);
  return profile.suppliers;
}

export type VendorReturnScanCandidate = {
  vendorId: string;
  vendorName: string;
  vendorCode: string;
  row: VendorSku;
  scannedQuantityMultiplier: number;
};

export type VendorReturnScanResult =
  | { kind: "need_warehouse" }
  | { kind: "not_found" }
  | { kind: "not_linked" }
  | { kind: "no_stock"; sku: string }
  | {
      kind: "pick_vendor";
      sku: string;
      productName: string;
      candidates: VendorReturnScanCandidate[];
    }
  | {
      kind: "found";
      vendorId: string;
      row: VendorSku;
      scannedQuantityMultiplier: number;
    };

export async function resolveVendorReturnScan(
  barcode: string,
  warehouseId: string,
  vendorId?: string,
): Promise<VendorReturnScanResult> {
  const code = barcode.trim();
  if (!code) return { kind: "not_found" };
  if (!warehouseId) return { kind: "need_warehouse" };

  if (vendorId) {
    const result = await findVendorSkuByBarcode(vendorId, code, warehouseId);
    if (result.kind === "not_found") return { kind: "not_found" };
    if (result.kind === "not_linked") return { kind: "not_linked" };
    const row = await withReturnableQty(result.row, vendorId, warehouseId);
    return {
      kind: "found",
      vendorId,
      row,
      scannedQuantityMultiplier: result.scannedQuantityMultiplier,
    };
  }

  const sku = await lookupSkuByBarcode(code);
  if (!sku) return { kind: "not_found" };

  const suppliers = await loadSkuSuppliers(sku.id);
  if (suppliers.length === 0) return { kind: "not_linked" };

  const candidates: VendorReturnScanCandidate[] = [];
  for (const supplier of suppliers) {
    const result = await findVendorSkuByBarcode(
      supplier.vendorId,
      code,
      warehouseId,
    );
    if (result.kind !== "found") continue;
    const row = await withReturnableQty(
      result.row,
      supplier.vendorId,
      warehouseId,
    );
    candidates.push({
      vendorId: supplier.vendorId,
      vendorName: supplier.vendorName,
      vendorCode: supplier.vendorCode,
      row,
      scannedQuantityMultiplier: result.scannedQuantityMultiplier,
    });
  }

  if (candidates.length === 0) {
    return { kind: "not_linked" };
  }
  if (candidates.length === 1) {
    const only = candidates[0]!;
    if ((only.row.quantityAvailable ?? 0) <= 0) {
      return { kind: "no_stock", sku: sku.sku };
    }
    return {
      kind: "found",
      vendorId: only.vendorId,
      row: only.row,
      scannedQuantityMultiplier: only.scannedQuantityMultiplier,
    };
  }

  const withStock = candidates.filter((c) => (c.row.quantityAvailable ?? 0) > 0);
  if (withStock.length === 0) {
    return { kind: "no_stock", sku: sku.sku };
  }

  return {
    kind: "pick_vendor",
    sku: sku.sku,
    productName: sku.productName,
    candidates,
  };
}

export async function loadSkuByBarcode(
  barcode: string,
  warehouseId: string,
): Promise<SkuSearchResult> {
  try {
    const local = await window.blackbox?.localDb?.getSkuByBarcode?.(
      barcode,
      warehouseId,
    );
    if (local) return local;
  } catch {
    /* fall through to API */
  }
  return skusApi.byBarcode(barcode, warehouseId);
}

export async function lookupSkuByCode(
  sku: string,
): Promise<SkuBarcodeLookupResult | null> {
  const code = sku.trim();
  if (!code) return null;
  try {
    const local = await window.blackbox?.localDb?.lookupSkuByCode?.(code);
    if (local) return local;
  } catch {
    /* local lookup unavailable */
  }
  return null;
}

export async function lookupSkuByBarcode(
  barcode: string,
): Promise<SkuBarcodeLookupResult | null> {
  const code = barcode.trim();
  if (!code) return null;
  try {
    const local = await window.blackbox?.localDb?.lookupSkuByBarcode?.(code);
    if (local) return local;
  } catch {
    /* fall through to API */
  }
  try {
    return await skusApi.lookupByBarcode(code);
  } catch (error: unknown) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export async function loadInventoryInOutReport(
  dateFrom: string,
  dateTo: string,
): Promise<InventoryInOutReport> {
  try {
    const local = await window.blackbox?.localDb?.inventoryInOutReport?.(
      dateFrom,
      dateTo,
    );
    if (local) return local;
  } catch {
    /* fall through to API */
  }
  return inventoryReportsApi.inOut(dateFrom, dateTo);
}
