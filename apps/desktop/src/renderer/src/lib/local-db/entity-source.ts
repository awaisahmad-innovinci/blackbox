import type {
  GoodsReceiptDetail,
  InventoryInOutReport,
  InventoryOutDetail,
  PaginatedVendors,
  ProductDetail,
  ProductSkuDetail,
  ProductSupplierRow,
  PurchaseOrderDetail,
  ReceivingDraft,
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
import { vendorsApi } from "@renderer/lib/api/vendors";
import { warehousesApi } from "@renderer/lib/api/warehouses";

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

export async function loadInventoryOut(id: string): Promise<InventoryOutDetail> {
  const local = await window.blackbox?.localDb?.getInventoryOut(id);
  if (local) return local;
  return inventoryOutApi.get(id);
}

export async function loadVendors(
  query: VendorListQuery = {},
): Promise<PaginatedVendors> {
  try {
    const local = await window.blackbox?.localDb?.listVendors?.(query);
    if (local) return local;
  } catch {
    /* fall through to API */
  }
  return vendorsApi.list(query);
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
  try {
    const local = await window.blackbox?.localDb?.listVendorSkus?.(
      vendorId,
      q,
      warehouseId,
    );
    if (local) return local;
  } catch {
    /* fall through to API */
  }
  return vendorSkusApi.listByVendor(vendorId, q, warehouseId);
}

export async function loadSkuSearch(
  q?: string,
  warehouseId?: string,
): Promise<SkuSearchResult[]> {
  try {
    const local = await window.blackbox?.localDb?.searchSkus?.(q, warehouseId);
    if (local) return local;
  } catch {
    /* fall through to API */
  }
  return skusApi.search(q, warehouseId);
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
