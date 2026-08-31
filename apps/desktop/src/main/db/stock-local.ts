import type { SkuDetail, WarehouseStockRow } from "@blackbox/shared";
import {
  DEMO_STORE_TENANT_ID,
  roundMoney4,
  weightedAvgUnitCost,
} from "@blackbox/shared";
import { getLocalDb } from "./index";
import { getSkuLocal } from "./entity-get-local";

function nowIso(): string {
  return new Date().toISOString();
}

function stockRowId(productSkuId: string, warehouseId: string): string {
  return `${DEMO_STORE_TENANT_ID}:${productSkuId}:${warehouseId}`;
}

export function upsertStockLocal(row: WarehouseStockRow): void {
  const db = getLocalDb();
  const ts = nowIso();
  const id = stockRowId(row.productSkuId, row.warehouseId);
  db.prepare(
    `insert into inventory_stock (
      id, tenant_id, product_sku_id, warehouse_id,
      quantity_on_hand, quantity_reserved, quantity_available,
      created_at, updated_at, sync_status, server_updated_at
    ) values (
      @id, @tenantId, @productSkuId, @warehouseId,
      @quantityOnHand, @quantityReserved, @quantityAvailable,
      @createdAt, @updatedAt, 'synced', @serverUpdatedAt
    )
    on conflict(tenant_id, product_sku_id, warehouse_id) do update set
      quantity_on_hand = excluded.quantity_on_hand,
      quantity_reserved = excluded.quantity_reserved,
      quantity_available = excluded.quantity_available,
      updated_at = excluded.updated_at,
      sync_status = 'synced',
      server_updated_at = excluded.server_updated_at`,
  ).run({
    id,
    tenantId: DEMO_STORE_TENANT_ID,
    productSkuId: row.productSkuId,
    warehouseId: row.warehouseId,
    quantityOnHand: row.quantityOnHand,
    quantityReserved: row.quantityReserved,
    quantityAvailable: row.quantityAvailable,
    createdAt: ts,
    updatedAt: ts,
    serverUpdatedAt: ts,
  });
}

export function totalOnHandLocal(productSkuId: string): number {
  const db = getLocalDb();
  const row = db
    .prepare(
      `select coalesce(sum(quantity_on_hand), 0) as qty
       from inventory_stock
       where tenant_id = @tenantId and product_sku_id = @productSkuId`,
    )
    .get({
      tenantId: DEMO_STORE_TENANT_ID,
      productSkuId,
    }) as { qty: number } | undefined;
  return Number(row?.qty ?? 0);
}

export function applyPurchaseAvgCostLocal(
  productSkuId: string,
  inventoryDelta: number,
  receivingUnitCost: number,
  unitsPerPurchaseUnit: number,
): { sku: SkuDetail; avgCost: number } | null {
  const sku = getSkuLocal(productSkuId);
  if (!sku) return null;
  const unitsPer = unitsPerPurchaseUnit > 0 ? unitsPerPurchaseUnit : 1;
  const newCost = roundMoney4(receivingUnitCost / unitsPer);
  const oldQty = totalOnHandLocal(productSkuId);
  const avgCost = weightedAvgUnitCost(
    oldQty,
    sku.costPrice,
    inventoryDelta,
    newCost,
  );
  return { sku, avgCost };
}

export function applyStockDeltaLocal(
  productSkuId: string,
  warehouseId: string,
  delta: number,
): void {
  const db = getLocalDb();
  const existing = db
    .prepare(
      `select quantity_on_hand as qoh, quantity_reserved as qr
       from inventory_stock
       where tenant_id = @tenantId and product_sku_id = @productSkuId
         and warehouse_id = @warehouseId`,
    )
    .get({
      tenantId: DEMO_STORE_TENANT_ID,
      productSkuId,
      warehouseId,
    }) as { qoh: number; qr: number } | undefined;
  const onHand = Number(existing?.qoh ?? 0) + delta;
  const reserved = Number(existing?.qr ?? 0);
  upsertStockLocal({
    warehouseId,
    warehouseName: "",
    productSkuId,
    sku: "",
    variantName: "",
    quantityOnHand: onHand,
    quantityReserved: reserved,
    quantityAvailable: onHand - reserved,
  });
}

export function upsertStockRowsLocal(rows: WarehouseStockRow[]): void {
  const db = getLocalDb();
  const tx = db.transaction(() => {
    for (const row of rows) upsertStockLocal(row);
  });
  tx();
}
