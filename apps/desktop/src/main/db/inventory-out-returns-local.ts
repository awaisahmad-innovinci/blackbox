import type { InventoryOutReturnDetail } from "@blackbox/shared";
import { DEMO_STORE_TENANT_ID } from "@blackbox/shared";
import { getLocalDb } from "./index";

export function upsertInventoryOutReturnLocal(detail: InventoryOutReturnDetail): void {
  const db = getLocalDb();
  const tx = db.transaction(() => {
    db.prepare(
      `insert into inventory_out_returns (
        id, tenant_id, return_number, warehouse_id, return_date, notes, status,
        subtotal, total, created_at, updated_at, sync_status, server_updated_at
      ) values (
        @id, @tenantId, @returnNumber, @warehouseId, @returnDate, @notes, @status,
        @subtotal, @total, @createdAt, @updatedAt, 'synced', @serverUpdatedAt
      )
      on conflict(id) do update set
        return_number = excluded.return_number,
        warehouse_id = excluded.warehouse_id,
        return_date = excluded.return_date,
        notes = excluded.notes,
        status = excluded.status,
        subtotal = excluded.subtotal,
        total = excluded.total,
        updated_at = excluded.updated_at,
        sync_status = 'synced',
        server_updated_at = excluded.server_updated_at`,
    ).run({
      id: detail.id,
      tenantId: DEMO_STORE_TENANT_ID,
      returnNumber: detail.returnNumber,
      warehouseId: detail.warehouseId,
      returnDate: detail.returnDate,
      notes: detail.notes,
      status: detail.status,
      subtotal: detail.subtotal,
      total: detail.total,
      createdAt: detail.createdAt,
      updatedAt: detail.updatedAt,
      serverUpdatedAt: detail.updatedAt,
    });

    db.prepare(
      "delete from inventory_out_return_items where inventory_out_return_id = ?",
    ).run(detail.id);

    const insertItem = db.prepare(
      `insert into inventory_out_return_items (
        id, tenant_id, inventory_out_return_id, product_sku_id,
        inventory_out_item_id, quantity, unit_cost,
        created_at, updated_at, sync_status, server_updated_at
      ) values (
        @id, @tenantId, @inventoryOutReturnId, @productSkuId,
        @inventoryOutItemId, @quantity, @unitCost,
        @createdAt, @updatedAt, 'synced', @serverUpdatedAt
      )`,
    );

    for (const item of detail.items) {
      insertItem.run({
        id: item.id,
        tenantId: DEMO_STORE_TENANT_ID,
        inventoryOutReturnId: detail.id,
        productSkuId: item.productSkuId,
        inventoryOutItemId: item.inventoryOutItemId,
        quantity: item.quantity,
        unitCost: item.unitCost,
        createdAt: detail.updatedAt,
        updatedAt: detail.updatedAt,
        serverUpdatedAt: detail.updatedAt,
      });
    }
  });
  tx();
}

export function upsertInventoryOutReturnsLocal(
  rows: InventoryOutReturnDetail[],
): void {
  const db = getLocalDb();
  const tx = db.transaction(() => {
    for (const row of rows) upsertInventoryOutReturnLocal(row);
  });
  tx();
}
