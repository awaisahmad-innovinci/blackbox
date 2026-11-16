import type { InventoryOutDetail } from "@blackbox/shared";
import { DEMO_STORE_TENANT_ID } from "@blackbox/shared";
import { getLocalDb } from "./index";

/** A missing timestamp loses. Equal timestamps keep the row already stored. */
function storedOutIsLatest(
  storedUpdatedAt: string | null | undefined,
  incomingUpdatedAt: string | null | undefined,
): boolean {
  const stored = storedUpdatedAt?.trim() ?? "";
  const incoming = incomingUpdatedAt?.trim() ?? "";
  if (!stored && !incoming) return true;
  if (!stored) return false;
  if (!incoming) return true;
  return stored >= incoming;
}

export function upsertInventoryOutLocal(detail: InventoryOutDetail): void {
  const db = getLocalDb();
  const tx = db.transaction(() => {
    const existing = db
      .prepare(
        `select id, updated_at as updatedAt
         from inventory_outs
         where tenant_id = @tenantId
           and out_number = @outNumber
           and id != @id`,
      )
      .get({
        tenantId: DEMO_STORE_TENANT_ID,
        outNumber: detail.outNumber,
        id: detail.id,
      }) as { id: string; updatedAt: string | null } | undefined;
    if (existing) {
      if (storedOutIsLatest(existing.updatedAt, detail.updatedAt)) return;
      db.prepare(
        "delete from inventory_out_lines where inventory_out_id = ?",
      ).run(existing.id);
      db.prepare(
        `delete from local_sync_outbox
         where entity_type = 'inventory_out' and entity_id = ?`,
      ).run(existing.id);
      db.prepare("delete from inventory_outs where id = ?").run(existing.id);
    }

    db.prepare(
      `insert into inventory_outs (
        id, tenant_id, out_number, warehouse_id, out_date, reference, notes,
        status, subtotal, total, created_at, updated_at, sync_status, server_updated_at
      ) values (
        @id, @tenantId, @outNumber, @warehouseId, @outDate, @reference, @notes,
        @status, @subtotal, @total, @createdAt, @updatedAt, 'synced', @serverUpdatedAt
      )
      on conflict(id) do update set
        out_number = excluded.out_number,
        warehouse_id = excluded.warehouse_id,
        out_date = excluded.out_date,
        reference = excluded.reference,
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
      outNumber: detail.outNumber,
      warehouseId: detail.warehouseId,
      outDate: detail.outDate,
      reference: detail.reference,
      notes: detail.notes,
      status: detail.status,
      subtotal: detail.subtotal,
      total: detail.total,
      createdAt: detail.createdAt,
      updatedAt: detail.updatedAt,
      serverUpdatedAt: detail.updatedAt,
    });

    db.prepare("delete from inventory_out_lines where inventory_out_id = ?").run(
      detail.id,
    );

    const insertLine = db.prepare(
      `insert into inventory_out_lines (
        id, tenant_id, inventory_out_id, product_sku_id, quantity, unit_cost,
        created_at, updated_at, sync_status, server_updated_at
      ) values (
        @id, @tenantId, @inventoryOutId, @productSkuId, @quantity, @unitCost,
        @createdAt, @updatedAt, 'synced', @serverUpdatedAt
      )`,
    );

    for (const item of detail.items) {
      insertLine.run({
        id: item.id,
        tenantId: DEMO_STORE_TENANT_ID,
        inventoryOutId: detail.id,
        productSkuId: item.productSkuId,
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

export function upsertInventoryOutsLocal(rows: InventoryOutDetail[]): void {
  const db = getLocalDb();
  const tx = db.transaction(() => {
    for (const row of rows) {
      upsertInventoryOutLocal(row);
    }
  });
  tx();
}
