import type { EntityStatus, SkuBarcode } from "@blackbox/shared";
import { DEMO_STORE_TENANT_ID } from "@blackbox/shared";
import { getLocalDb } from "./index";

function nowIso(): string {
  return new Date().toISOString();
}

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function listSkuBarcodesLocal(productSkuId: string): SkuBarcode[] {
  const db = getLocalDb();
  const rows = db
    .prepare(
      `select id, product_sku_id as productSkuId, barcode, status, quantity_multiplier as quantityMultiplier
       from product_sku_barcodes
       where tenant_id = ? and product_sku_id = ? and status = 'active'
       order by created_at asc`,
    )
    .all(DEMO_STORE_TENANT_ID, productSkuId) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    id: String(row.id),
    productSkuId: String(row.productSkuId),
    barcode: String(row.barcode),
    status: row.status as EntityStatus,
    quantityMultiplier: num(row.quantityMultiplier, 1),
  }));
}

export function upsertSkuBarcodeLocal(row: SkuBarcode): void {
  const db = getLocalDb();
  const ts = nowIso();
  db.prepare(
    `insert into product_sku_barcodes (
      id, tenant_id, product_sku_id, barcode, quantity_multiplier, status, created_at, updated_at, sync_status, server_updated_at
    ) values (
      @id, @tenantId, @productSkuId, @barcode, @quantityMultiplier, @status, @createdAt, @updatedAt, 'synced', @serverUpdatedAt
    )
    on conflict(id) do update set
      product_sku_id = excluded.product_sku_id,
      barcode = excluded.barcode,
      quantity_multiplier = excluded.quantity_multiplier,
      status = excluded.status,
      updated_at = excluded.updated_at,
      sync_status = 'synced',
      server_updated_at = excluded.server_updated_at`,
  ).run({
    id: row.id,
    tenantId: DEMO_STORE_TENANT_ID,
    productSkuId: row.productSkuId,
    barcode: row.barcode,
    quantityMultiplier: row.quantityMultiplier ?? 1,
    status: row.status,
    createdAt: ts,
    updatedAt: ts,
    serverUpdatedAt: ts,
  });
  refreshSkuDisplayBarcodeLocal(row.productSkuId);
}

export function deleteSkuBarcodeLocal(id: string, productSkuId: string): void {
  const db = getLocalDb();
  db.prepare(
    `delete from product_sku_barcodes where id = ? and tenant_id = ?`,
  ).run(id, DEMO_STORE_TENANT_ID);
  refreshSkuDisplayBarcodeLocal(productSkuId);
}

export function refreshSkuDisplayBarcodeLocal(productSkuId: string): void {
  const db = getLocalDb();
  const first = db
    .prepare(
      `select barcode from product_sku_barcodes
       where tenant_id = ? and product_sku_id = ? and status = 'active'
       order by created_at asc
       limit 1`,
    )
    .get(DEMO_STORE_TENANT_ID, productSkuId) as { barcode: string } | undefined;
  db.prepare(
    `update product_skus set barcode = ?, updated_at = ? where id = ? and tenant_id = ?`,
  ).run(first?.barcode ?? null, nowIso(), productSkuId, DEMO_STORE_TENANT_ID);
}

export type BarcodeMatchLocal = {
  skuId: string;
  quantityMultiplier: number;
};

export function findBarcodeMatchLocal(
  barcode: string,
  activeOnly = false,
): BarcodeMatchLocal | null {
  const code = barcode.trim();
  if (!code) return null;
  const db = getLocalDb();
  const row = db
    .prepare(
      `select product_sku_id as productSkuId, quantity_multiplier as quantityMultiplier
       from product_sku_barcodes
       where tenant_id = ? and barcode = ?
         ${activeOnly ? "and status = 'active'" : ""}
       limit 1`,
    )
    .get(DEMO_STORE_TENANT_ID, code) as
    | { productSkuId: string; quantityMultiplier: unknown }
    | undefined;
  if (row) {
    return {
      skuId: String(row.productSkuId),
      quantityMultiplier: num(row.quantityMultiplier, 1),
    };
  }

  const legacy = db
    .prepare(
      `select id from product_skus
       where tenant_id = ? and barcode = ?
         ${activeOnly ? "and status = 'active'" : ""}
       limit 1`,
    )
    .get(DEMO_STORE_TENANT_ID, code) as { id: string } | undefined;
  return legacy ? { skuId: String(legacy.id), quantityMultiplier: 1 } : null;
}

export function findSkuIdByBarcodeLocal(
  barcode: string,
  activeOnly = false,
): string | null {
  return findBarcodeMatchLocal(barcode, activeOnly)?.skuId ?? null;
}
