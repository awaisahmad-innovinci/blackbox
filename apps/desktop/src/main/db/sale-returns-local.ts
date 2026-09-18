import type { SaleReturnDetail } from "@blackbox/shared";
import { DEMO_STORE_TENANT_ID } from "@blackbox/shared";
import { getLocalDb } from "./index";

export function upsertSaleReturnLocal(detail: SaleReturnDetail): void {
  const db = getLocalDb();
  const now = new Date().toISOString();
  db.prepare(
    `insert into sale_returns (
      id, tenant_id, return_number, sale_id, warehouse_id, return_date, status,
      subtotal, gst_rate, gst_amount, sales_tax_rate, sales_tax_amount, refund_total,
      refund_method, notes, processed_by, processed_by_name, created_at, updated_at, sync_status, server_updated_at
    ) values (
      @id, @tenantId, @returnNumber, @saleId, @warehouseId, @returnDate, @status,
      @subtotal, @gstRate, @gstAmount, @salesTaxRate, @salesTaxAmount, @refundTotal,
      @refundMethod, @notes, @processedBy, @processedByName, @createdAt, @updatedAt, 'synced', @serverUpdatedAt
    )
    on conflict(id) do update set
      return_number = excluded.return_number,
      sale_id = excluded.sale_id,
      warehouse_id = excluded.warehouse_id,
      return_date = excluded.return_date,
      status = excluded.status,
      subtotal = excluded.subtotal,
      gst_rate = excluded.gst_rate,
      gst_amount = excluded.gst_amount,
      sales_tax_rate = excluded.sales_tax_rate,
      sales_tax_amount = excluded.sales_tax_amount,
      refund_total = excluded.refund_total,
      refund_method = excluded.refund_method,
      notes = excluded.notes,
      processed_by = excluded.processed_by,
      processed_by_name = excluded.processed_by_name,
      updated_at = excluded.updated_at,
      server_updated_at = excluded.server_updated_at`,
  ).run({
    id: detail.id,
    tenantId: DEMO_STORE_TENANT_ID,
    returnNumber: detail.returnNumber,
    saleId: detail.saleId,
    warehouseId: detail.warehouseId,
    returnDate: detail.returnDate,
    status: detail.status,
    subtotal: detail.subtotal,
    gstRate: detail.gstRate,
    gstAmount: detail.gstAmount,
    salesTaxRate: detail.salesTaxRate,
    salesTaxAmount: detail.salesTaxAmount,
    refundTotal: detail.refundTotal,
    refundMethod: detail.refundMethod,
    notes: detail.notes,
    processedBy: detail.processedBy,
    processedByName: detail.processedByName,
    createdAt: detail.createdAt,
    updatedAt: detail.updatedAt,
    serverUpdatedAt: detail.updatedAt,
  });

  db.prepare(
    `delete from sale_return_lines where sale_return_id = ? and tenant_id = ?`,
  ).run(detail.id, DEMO_STORE_TENANT_ID);

  const insertLine = db.prepare(
    `insert into sale_return_lines (
      id, tenant_id, sale_return_id, sale_line_id, product_sku_id, quantity,
      unit_price, discount_percent, line_total, sell_unit, barcode, created_at, updated_at
    ) values (
      @id, @tenantId, @saleReturnId, @saleLineId, @productSkuId, @quantity,
      @unitPrice, @discountPercent, @lineTotal, @sellUnit, @barcode, @createdAt, @updatedAt
    )`,
  );

  for (const item of detail.items) {
    insertLine.run({
      id: item.id,
      tenantId: DEMO_STORE_TENANT_ID,
      saleReturnId: detail.id,
      saleLineId: item.saleLineId,
      productSkuId: item.productSkuId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discountPercent: item.discountPercent,
      lineTotal: item.lineTotal,
      sellUnit: item.sellUnit,
      barcode: item.barcode,
      createdAt: now,
      updatedAt: now,
    });
  }
}

export function listSaleReturnNumbersLocal(): string[] {
  const db = getLocalDb();
  const rows = db
    .prepare(
      `select return_number as returnNumber from sale_returns where tenant_id = @tenantId`,
    )
    .all({ tenantId: DEMO_STORE_TENANT_ID }) as Array<{ returnNumber: string }>;
  return rows.map((r) => String(r.returnNumber));
}
