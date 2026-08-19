import type { WarehouseStockRow } from "@blackbox/shared";
import { DEMO_STORE_TENANT_ID } from "@blackbox/shared";
import { getLocalDb } from "./index";

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

export function upsertStockRowsLocal(rows: WarehouseStockRow[]): void {
  const db = getLocalDb();
  const tx = db.transaction(() => {
    for (const row of rows) upsertStockLocal(row);
  });
  tx();
}
