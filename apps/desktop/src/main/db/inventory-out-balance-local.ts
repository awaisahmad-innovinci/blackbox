import { DEMO_STORE_TENANT_ID } from "@blackbox/shared";
import { getLocalDb } from "./index";

function nowIso(): string {
  return new Date().toISOString();
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** Apply signed delta to POS out balance (inventory_out_items). */
export function applyInventoryOutBalanceDeltaLocal(
  warehouseId: string,
  productSkuId: string,
  deltaQty: number,
  unitCost: number,
): void {
  const delta = round4(deltaQty);
  if (!(delta !== 0)) return;

  const db = getLocalDb();
  const ts = nowIso();
  const existing = db
    .prepare(
      `select id, quantity from inventory_out_items
       where tenant_id = @tenantId and warehouse_id = @warehouseId
         and product_sku_id = @productSkuId`,
    )
    .get({
      tenantId: DEMO_STORE_TENANT_ID,
      warehouseId,
      productSkuId,
    }) as { id: string; quantity: number } | undefined;

  if (delta > 0) {
    if (existing) {
      const nextQty = round4(Number(existing.quantity) + delta);
      db.prepare(
        `update inventory_out_items
         set quantity = @quantity, unit_cost = @unitCost, updated_at = @updatedAt
         where id = @id`,
      ).run({
        id: existing.id,
        quantity: nextQty,
        unitCost: round4(unitCost),
        updatedAt: ts,
      });
      return;
    }
    db.prepare(
      `insert into inventory_out_items (
        id, tenant_id, warehouse_id, product_sku_id, quantity, unit_cost,
        created_at, updated_at, sync_status, server_updated_at
      ) values (
        @id, @tenantId, @warehouseId, @productSkuId, @quantity, @unitCost,
        @createdAt, @updatedAt, 'pending', null
      )`,
    ).run({
      id: crypto.randomUUID(),
      tenantId: DEMO_STORE_TENANT_ID,
      warehouseId,
      productSkuId,
      quantity: delta,
      unitCost: round4(unitCost),
      createdAt: ts,
      updatedAt: ts,
    });
    return;
  }

  const abs = round4(-delta);
  if (!existing) {
    throw new Error("No inventory out balance for this SKU in the selected warehouse");
  }
  const current = Number(existing.quantity);
  if (abs > current) {
    throw new Error(
      `Return quantity exceeds out balance: requested ${abs}, available ${current}`,
    );
  }
  const nextQty = round4(current - abs);
  if (nextQty <= 0) {
    db.prepare(`delete from inventory_out_items where id = ?`).run(existing.id);
    return;
  }
  db.prepare(
    `update inventory_out_items
     set quantity = @quantity, updated_at = @updatedAt
     where id = @id`,
  ).run({ id: existing.id, quantity: nextQty, updatedAt: ts });
}

export function getInventoryOutBalanceQtyLocal(
  warehouseId: string,
  productSkuId: string,
): number {
  const db = getLocalDb();
  const row = db
    .prepare(
      `select quantity from inventory_out_items
       where tenant_id = @tenantId and warehouse_id = @warehouseId
         and product_sku_id = @productSkuId`,
    )
    .get({
      tenantId: DEMO_STORE_TENANT_ID,
      warehouseId,
      productSkuId,
    }) as { quantity: number } | undefined;
  return row ? Number(row.quantity) : 0;
}
