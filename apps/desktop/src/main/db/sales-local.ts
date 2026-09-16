import type { SaleDetail } from "@blackbox/shared";
import { DEMO_STORE_TENANT_ID } from "@blackbox/shared";
import { getInventoryOutBalanceQtyLocal } from "./inventory-out-balance-local";
import { getLocalDb } from "./index";

export function upsertSaleLocal(
  detail: SaleDetail,
  options?: { syncStatus?: "synced" | "local" },
): void {
  const syncStatus = options?.syncStatus ?? "synced";
  const db = getLocalDb();
  const tx = db.transaction(() => {
    db.prepare(
      `insert into sales (
        id, tenant_id, sale_number, warehouse_id, status,
        subtotal, gst_rate, gst_amount, sales_tax_rate, sales_tax_amount, total,
        device_id, posted_by, posted_at, customer_name, posted_by_name, cash_tendered, notes,
        created_at, updated_at, sync_status, server_updated_at
      ) values (
        @id, @tenantId, @saleNumber, @warehouseId, @status,
        @subtotal, @gstRate, @gstAmount, @salesTaxRate, @salesTaxAmount, @total,
        @deviceId, @postedBy, @postedAt, @customerName, @postedByName, @cashTendered, @notes,
        @createdAt, @updatedAt, @syncStatus, @serverUpdatedAt
      )
      on conflict(id) do update set
        sale_number = excluded.sale_number,
        warehouse_id = excluded.warehouse_id,
        status = excluded.status,
        subtotal = excluded.subtotal,
        gst_rate = excluded.gst_rate,
        gst_amount = excluded.gst_amount,
        sales_tax_rate = excluded.sales_tax_rate,
        sales_tax_amount = excluded.sales_tax_amount,
        total = excluded.total,
        device_id = excluded.device_id,
        posted_by = excluded.posted_by,
        posted_at = excluded.posted_at,
        customer_name = excluded.customer_name,
        posted_by_name = excluded.posted_by_name,
        cash_tendered = excluded.cash_tendered,
        notes = excluded.notes,
        updated_at = excluded.updated_at,
        sync_status = excluded.sync_status,
        server_updated_at = excluded.server_updated_at`,
    ).run({
      id: detail.id,
      tenantId: DEMO_STORE_TENANT_ID,
      saleNumber: detail.saleNumber,
      warehouseId: detail.warehouseId,
      status: detail.status,
      subtotal: detail.subtotal,
      gstRate: detail.gstRate,
      gstAmount: detail.gstAmount,
      salesTaxRate: detail.salesTaxRate,
      salesTaxAmount: detail.salesTaxAmount,
      total: detail.total,
      deviceId: detail.deviceId,
      postedBy: detail.postedBy,
      postedAt: detail.postedAt,
      customerName: detail.customerName,
      postedByName: detail.postedByName,
      cashTendered: detail.cashTendered,
      notes: detail.notes,
      createdAt: detail.createdAt,
      updatedAt: detail.updatedAt,
      syncStatus,
      serverUpdatedAt: syncStatus === "synced" ? detail.updatedAt : null,
    });

    db.prepare("delete from sale_lines where sale_id = ?").run(detail.id);
    db.prepare("delete from sale_payments where sale_id = ?").run(detail.id);

    const insertLine = db.prepare(
      `insert into sale_lines (
        id, tenant_id, sale_id, product_sku_id, quantity, unit_price, line_total,
        sell_unit, barcode, created_at, updated_at, sync_status, server_updated_at
      ) values (
        @id, @tenantId, @saleId, @productSkuId, @quantity, @unitPrice, @lineTotal,
        @sellUnit, @barcode, @createdAt, @updatedAt, 'synced', @serverUpdatedAt
      )`,
    );

    for (const item of detail.items) {
      insertLine.run({
        id: item.id,
        tenantId: DEMO_STORE_TENANT_ID,
        saleId: detail.id,
        productSkuId: item.productSkuId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: item.lineTotal,
        sellUnit: item.sellUnit,
        barcode: item.barcode,
        createdAt: detail.updatedAt,
        updatedAt: detail.updatedAt,
        serverUpdatedAt: detail.updatedAt,
      });
    }

    const insertPayment = db.prepare(
      `insert into sale_payments (
        id, tenant_id, sale_id, method, amount, reference,
        created_at, updated_at, sync_status, server_updated_at
      ) values (
        @id, @tenantId, @saleId, @method, @amount, @reference,
        @createdAt, @updatedAt, 'synced', @serverUpdatedAt
      )`,
    );

    for (const payment of detail.payments) {
      insertPayment.run({
        id: payment.id,
        tenantId: DEMO_STORE_TENANT_ID,
        saleId: detail.id,
        method: payment.method,
        amount: payment.amount,
        reference: payment.reference,
        createdAt: detail.updatedAt,
        updatedAt: detail.updatedAt,
        serverUpdatedAt: detail.updatedAt,
      });
    }
  });
  tx();
}

/** Device-local held bill — not synced until posted. */
export function upsertSaleDraftLocal(detail: SaleDetail): void {
  upsertSaleLocal({ ...detail, status: "DRAFT" }, { syncStatus: "local" });
}

export function deleteSaleDraftLocal(id: string): boolean {
  const db = getLocalDb();
  const row = db
    .prepare(
      `select id from sales where id = ? and tenant_id = ? and status = 'DRAFT' and sync_status = 'local'`,
    )
    .get(id, DEMO_STORE_TENANT_ID) as { id: string } | undefined;
  if (!row) return false;
  const tx = db.transaction(() => {
    db.prepare("delete from sale_payments where sale_id = ?").run(id);
    db.prepare("delete from sale_lines where sale_id = ?").run(id);
    db.prepare("delete from sales where id = ?").run(id);
  });
  tx();
  return true;
}

export function countDraftSalesLocal(): number {
  const db = getLocalDb();
  const row = db
    .prepare(
      `select count(*) as cnt from sales where tenant_id = ? and status = 'DRAFT' and sync_status = 'local'`,
    )
    .get(DEMO_STORE_TENANT_ID) as { cnt: number };
  return Number(row.cnt);
}

export function getDraftSaleReservedQtyLocal(
  warehouseId: string,
  productSkuId: string,
  excludeSaleId?: string | null,
): number {
  const db = getLocalDb();
  const row = db
    .prepare(
      `select coalesce(sum(l.quantity), 0) as qty
       from sale_lines l
       inner join sales s on s.id = l.sale_id and s.tenant_id = l.tenant_id
       where s.tenant_id = @tenantId
         and s.status = 'DRAFT'
         and s.sync_status = 'local'
         and s.warehouse_id = @warehouseId
         and l.product_sku_id = @productSkuId
         and (@excludeSaleId = '' or s.id != @excludeSaleId)`,
    )
    .get({
      tenantId: DEMO_STORE_TENANT_ID,
      warehouseId,
      productSkuId,
      excludeSaleId: excludeSaleId ?? "",
    }) as { qty: number };
  return Number(row.qty);
}

export function getPosAvailableForSaleLocal(
  warehouseId: string,
  productSkuId: string,
  excludeSaleId?: string | null,
): number {
  const balance = getInventoryOutBalanceQtyLocal(warehouseId, productSkuId);
  const reserved = getDraftSaleReservedQtyLocal(
    warehouseId,
    productSkuId,
    excludeSaleId,
  );
  return Math.max(0, Math.round((balance - reserved) * 10000) / 10000);
}

export function upsertSalesLocal(rows: SaleDetail[]): void {
  const db = getLocalDb();
  const tx = db.transaction(() => {
    for (const row of rows) upsertSaleLocal(row);
  });
  tx();
}
