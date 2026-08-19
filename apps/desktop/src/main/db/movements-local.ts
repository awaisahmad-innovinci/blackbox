import type { InventoryMovementListItem } from "@blackbox/shared";
import { DEMO_STORE_TENANT_ID } from "@blackbox/shared";
import { getLocalDb } from "./index";

export function upsertInventoryMovementLocal(
  row: InventoryMovementListItem,
): void {
  const db = getLocalDb();
  db.prepare(
    `insert into inventory_movements (
      id, tenant_id, product_sku_id, warehouse_id, movement_type, quantity,
      reference_type, reference_id, reason, created_at, sync_status, server_updated_at
    ) values (
      @id, @tenantId, @productSkuId, @warehouseId, @movementType, @quantity,
      @referenceType, @referenceId, @reason, @createdAt, 'synced', @serverUpdatedAt
    )
    on conflict(id) do update set
      product_sku_id = excluded.product_sku_id,
      warehouse_id = excluded.warehouse_id,
      movement_type = excluded.movement_type,
      quantity = excluded.quantity,
      reference_type = excluded.reference_type,
      reference_id = excluded.reference_id,
      reason = excluded.reason,
      created_at = excluded.created_at,
      sync_status = 'synced',
      server_updated_at = excluded.server_updated_at`,
  ).run({
    id: row.id,
    tenantId: DEMO_STORE_TENANT_ID,
    productSkuId: row.productSkuId,
    warehouseId: row.warehouseId,
    movementType: row.movementType,
    quantity: row.quantity,
    referenceType: row.referenceType,
    referenceId: row.referenceId,
    reason: row.reason,
    createdAt: row.createdAt,
    serverUpdatedAt: row.createdAt,
  });
}

export function upsertInventoryMovementsLocal(
  rows: InventoryMovementListItem[],
): void {
  const db = getLocalDb();
  const tx = db.transaction(() => {
    for (const row of rows) upsertInventoryMovementLocal(row);
  });
  tx();
}
