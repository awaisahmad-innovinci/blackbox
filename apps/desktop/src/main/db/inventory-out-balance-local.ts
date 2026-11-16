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

type BalanceAgg = {
  warehouseId: string;
  productSkuId: string;
  qty: number;
  unitCost: number;
};

function balanceKey(warehouseId: string, productSkuId: string): string {
  return `${warehouseId}\0${productSkuId}`;
}

/**
 * Rebuilds POS balance rows from synced documents (outs, returns, sales).
 * Used after full sync when lines were imported without per-document deltas.
 */
export function rebuildInventoryOutBalanceFromDocumentsLocal(): void {
  const db = getLocalDb();
  const tenantId = DEMO_STORE_TENANT_ID;
  const ts = nowIso();
  const net = new Map<string, BalanceAgg>();

  const bump = (
    warehouseId: string,
    productSkuId: string,
    delta: number,
    unitCost: number,
  ): void => {
    if (!warehouseId || !productSkuId) return;
    const d = round4(delta);
    if (d === 0) return;
    const key = balanceKey(warehouseId, productSkuId);
    const cur = net.get(key) ?? {
      warehouseId,
      productSkuId,
      qty: 0,
      unitCost: 0,
    };
    cur.qty = round4(cur.qty + d);
    if (unitCost > 0) cur.unitCost = round4(unitCost);
    net.set(key, cur);
  };

  const outLines = db
    .prepare(
      `select o.warehouse_id as warehouseId, l.product_sku_id as productSkuId,
              l.quantity as quantity, l.unit_cost as unitCost
       from inventory_out_lines l
       inner join inventory_outs o on o.id = l.inventory_out_id
       where o.tenant_id = @tenantId and o.status = 'POSTED'`,
    )
    .all({ tenantId }) as Array<{
    warehouseId: string;
    productSkuId: string;
    quantity: number;
    unitCost: number;
  }>;
  for (const row of outLines) {
    bump(row.warehouseId, row.productSkuId, row.quantity, row.unitCost);
  }

  const outReturnLines = db
    .prepare(
      `select r.warehouse_id as warehouseId, i.product_sku_id as productSkuId,
              i.quantity as quantity, i.unit_cost as unitCost
       from inventory_out_return_items i
       inner join inventory_out_returns r on r.id = i.inventory_out_return_id
       where r.tenant_id = @tenantId and r.status = 'POSTED'`,
    )
    .all({ tenantId }) as Array<{
    warehouseId: string;
    productSkuId: string;
    quantity: number;
    unitCost: number;
  }>;
  for (const row of outReturnLines) {
    bump(row.warehouseId, row.productSkuId, -row.quantity, row.unitCost);
  }

  const saleLines = db
    .prepare(
      `select s.warehouse_id as warehouseId, l.product_sku_id as productSkuId,
              l.quantity + coalesce(l.foc_quantity, 0) as quantity,
              l.unit_price as unitCost
       from sale_lines l
       inner join sales s on s.id = l.sale_id
       where s.tenant_id = @tenantId and s.status = 'POSTED'`,
    )
    .all({ tenantId }) as Array<{
    warehouseId: string;
    productSkuId: string;
    quantity: number;
    unitCost: number;
  }>;
  for (const row of saleLines) {
    bump(row.warehouseId, row.productSkuId, -row.quantity, row.unitCost);
  }

  const saleReturnLines = db
    .prepare(
      `select r.warehouse_id as warehouseId, l.product_sku_id as productSkuId,
              l.quantity as quantity, l.unit_price as unitCost
       from sale_return_lines l
       inner join sale_returns r on r.id = l.sale_return_id
       where r.tenant_id = @tenantId and r.status != 'COMPLETED'`,
    )
    .all({ tenantId }) as Array<{
    warehouseId: string;
    productSkuId: string;
    quantity: number;
    unitCost: number;
  }>;
  for (const row of saleReturnLines) {
    bump(row.warehouseId, row.productSkuId, row.quantity, row.unitCost);
  }

  const tx = db.transaction(() => {
    db.prepare(`delete from inventory_out_items where tenant_id = ?`).run(
      tenantId,
    );

    const insert = db.prepare(
      `insert into inventory_out_items (
        id, tenant_id, warehouse_id, product_sku_id, quantity, unit_cost,
        created_at, updated_at, sync_status, server_updated_at
      ) values (
        @id, @tenantId, @warehouseId, @productSkuId, @quantity, @unitCost,
        @createdAt, @updatedAt, 'synced', null
      )`,
    );

    for (const row of net.values()) {
      if (!(row.qty > 0)) continue;
      insert.run({
        id: crypto.randomUUID(),
        tenantId,
        warehouseId: row.warehouseId,
        productSkuId: row.productSkuId,
        quantity: row.qty,
        unitCost: row.unitCost,
        createdAt: ts,
        updatedAt: ts,
      });
    }
  });
  tx();
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
