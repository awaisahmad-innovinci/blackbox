import type { ProductDetail, ProductSkuDetail } from "@blackbox/shared";
import { DEMO_STORE_TENANT_ID } from "@blackbox/shared";
import { getLocalDb } from "./index";

function nowIso(): string {
  return new Date().toISOString();
}

export function upsertProductLocal(detail: ProductDetail): void {
  const db = getLocalDb();
  db.prepare(
    `insert into products (
      id, tenant_id, name, product_code, brand_id, category_id, product_type,
      description, image_path, status, created_at, updated_at, sync_status, server_updated_at
    ) values (
      @id, @tenantId, @name, @productCode, @brandId, @categoryId, @productType,
      @description, @imagePath, @status, @createdAt, @updatedAt, 'synced', @serverUpdatedAt
    )
    on conflict(id) do update set
      name = excluded.name,
      product_code = excluded.product_code,
      brand_id = excluded.brand_id,
      category_id = excluded.category_id,
      product_type = excluded.product_type,
      description = excluded.description,
      image_path = excluded.image_path,
      status = excluded.status,
      updated_at = excluded.updated_at,
      sync_status = 'synced',
      server_updated_at = excluded.server_updated_at`,
  ).run({
    id: detail.id,
    tenantId: DEMO_STORE_TENANT_ID,
    name: detail.name,
    productCode: detail.productCode,
    brandId: detail.brandId,
    categoryId: detail.categoryId,
    productType: detail.productType,
    description: detail.description,
    imagePath: detail.imagePath,
    status: detail.status,
    createdAt: detail.createdAt,
    updatedAt: detail.updatedAt,
    serverUpdatedAt: detail.updatedAt,
  });
}

export function upsertProductSkuLocal(row: ProductSkuDetail): void {
  const db = getLocalDb();
  const ts = nowIso();
  db.prepare(
    `insert into product_skus (
      id, tenant_id, product_id, sku, barcode, variant_name, size_value, size_unit,
      base_unit_id, purchase_unit_id, units_per_purchase_unit, cost_price, selling_price,
      selling_price_per_purchase_unit, reorder_level, minimum_stock_level, maximum_stock_level, track_inventory, status,
      created_at, updated_at, sync_status, server_updated_at
    ) values (
      @id, @tenantId, @productId, @sku, @barcode, @variantName, @sizeValue, @sizeUnit,
      @baseUnitId, @purchaseUnitId, @unitsPerPurchaseUnit, @costPrice, @sellingPrice,
      @sellingPricePerPurchaseUnit, @reorderLevel, @minimumStockLevel, @maximumStockLevel, @trackInventory, @status,
      @createdAt, @updatedAt, 'synced', @serverUpdatedAt
    )
    on conflict(id) do update set
      sku = excluded.sku,
      barcode = excluded.barcode,
      variant_name = excluded.variant_name,
      size_value = excluded.size_value,
      size_unit = excluded.size_unit,
      base_unit_id = excluded.base_unit_id,
      purchase_unit_id = excluded.purchase_unit_id,
      units_per_purchase_unit = excluded.units_per_purchase_unit,
      cost_price = excluded.cost_price,
      selling_price = excluded.selling_price,
      selling_price_per_purchase_unit = excluded.selling_price_per_purchase_unit,
      reorder_level = excluded.reorder_level,
      minimum_stock_level = excluded.minimum_stock_level,
      maximum_stock_level = excluded.maximum_stock_level,
      track_inventory = excluded.track_inventory,
      status = excluded.status,
      updated_at = excluded.updated_at,
      sync_status = 'synced',
      server_updated_at = excluded.server_updated_at`,
  ).run({
    id: row.id,
    tenantId: DEMO_STORE_TENANT_ID,
    productId: row.productId,
    sku: row.sku,
    barcode: row.barcode,
    variantName: row.variantName,
    sizeValue: row.sizeValue,
    sizeUnit: row.sizeUnit,
    baseUnitId: row.baseUnitId,
    purchaseUnitId: row.purchaseUnitId,
    unitsPerPurchaseUnit: row.unitsPerPurchaseUnit,
    costPrice: row.costPrice,
    sellingPrice: row.sellingPrice,
    sellingPricePerPurchaseUnit: row.sellingPricePerPurchaseUnit,
    reorderLevel: row.reorderLevel,
    minimumStockLevel: row.minimumStockLevel,
    maximumStockLevel: row.maximumStockLevel,
    trackInventory: row.trackInventory ? 1 : 0,
    status: row.status,
    createdAt: ts,
    updatedAt: ts,
    serverUpdatedAt: ts,
  });
}

export function upsertProductsLocal(rows: ProductDetail[]): void {
  const db = getLocalDb();
  const tx = db.transaction(() => {
    for (const row of rows) upsertProductLocal(row);
  });
  tx();
}

export function upsertProductSkusLocal(rows: ProductSkuDetail[]): void {
  const db = getLocalDb();
  const tx = db.transaction(() => {
    for (const row of rows) upsertProductSkuLocal(row);
  });
  tx();
}
