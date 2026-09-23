import type { SaleReturnDetail, SaleReturnLookupSummary } from "@blackbox/shared";
import { DEMO_STORE_TENANT_ID } from "@blackbox/shared";
import type Database from "better-sqlite3";
import { getSaleReturnLocal } from "./entity-get-local";
import { applyInventoryOutBalanceDeltaLocal } from "./inventory-out-balance-local";
import { getLocalDb } from "./index";

function removeStaleSaleReturnByNumber(
  db: Database.Database,
  tenantId: string,
  returnNumber: string,
  keepId: string,
): void {
  const stale = db
    .prepare(
      `select id, status, warehouse_id as warehouseId
       from sale_returns
       where tenant_id = @tenantId and return_number = @returnNumber and id != @keepId
       limit 1`,
    )
    .get({ tenantId, returnNumber, keepId }) as
    | { id: string; status: string; warehouseId: string }
    | undefined;

  if (!stale) return;

  if (stale.status === "PENDING") {
    const lines = db
      .prepare(
        `select product_sku_id as productSkuId, quantity, unit_price as unitPrice
         from sale_return_lines where sale_return_id = ?`,
      )
      .all(stale.id) as Array<{
      productSkuId: string;
      quantity: number;
      unitPrice: number;
    }>;

    for (const line of lines) {
      const balanceRow = db
        .prepare(
          `select unit_cost as unitCost from inventory_out_items
           where tenant_id = @tenantId and warehouse_id = @warehouseId
             and product_sku_id = @productSkuId`,
        )
        .get({
          tenantId,
          warehouseId: stale.warehouseId,
          productSkuId: line.productSkuId,
        }) as { unitCost: number } | undefined;
      const unitCost = balanceRow ? Number(balanceRow.unitCost) : line.unitPrice;
      applyInventoryOutBalanceDeltaLocal(
        stale.warehouseId,
        line.productSkuId,
        -line.quantity,
        unitCost,
      );
    }
  }

  db.prepare(
    `delete from sale_return_lines where sale_return_id = ? and tenant_id = ?`,
  ).run(stale.id, tenantId);
  db.prepare(`delete from sale_returns where id = ?`).run(stale.id);
}

export function upsertSaleReturnLocal(detail: SaleReturnDetail): void {
  const db = getLocalDb();
  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    removeStaleSaleReturnByNumber(
      db,
      DEMO_STORE_TENANT_ID,
      detail.returnNumber,
      detail.id,
    );

    db.prepare(
    `insert into sale_returns (
      id, tenant_id, return_number, sale_id, warehouse_id, return_date, status,
      subtotal, gst_rate, gst_amount, sales_tax_rate, sales_tax_amount, refund_total,
      refund_method, notes, processed_by, processed_by_name, issued_by, issued_by_name,
      refunded_by, refunded_by_name, refunded_at, applied_to_sale_id, completion_mode,
      created_at, updated_at, sync_status, server_updated_at
    ) values (
      @id, @tenantId, @returnNumber, @saleId, @warehouseId, @returnDate, @status,
      @subtotal, @gstRate, @gstAmount, @salesTaxRate, @salesTaxAmount, @refundTotal,
      @refundMethod, @notes, @processedBy, @processedByName, @issuedBy, @issuedByName,
      @refundedBy, @refundedByName, @refundedAt, @appliedToSaleId, @completionMode,
      @createdAt, @updatedAt, 'synced', @serverUpdatedAt
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
      issued_by = excluded.issued_by,
      issued_by_name = excluded.issued_by_name,
      refunded_by = excluded.refunded_by,
      refunded_by_name = excluded.refunded_by_name,
      refunded_at = excluded.refunded_at,
      applied_to_sale_id = excluded.applied_to_sale_id,
      completion_mode = excluded.completion_mode,
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
    processedBy: detail.processedBy ?? detail.issuedBy,
    processedByName: detail.processedByName ?? detail.issuedByName,
    issuedBy: detail.issuedBy ?? detail.processedBy,
    issuedByName: detail.issuedByName ?? detail.processedByName,
    refundedBy: detail.refundedBy,
    refundedByName: detail.refundedByName,
    refundedAt: detail.refundedAt,
    appliedToSaleId: detail.appliedToSaleId,
    completionMode: detail.completionMode,
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
  });
  tx();
}

export function lookupSaleReturnLocal(
  returnNumber: string,
): SaleReturnLookupSummary {
  const db = getLocalDb();
  const trimmed = returnNumber.trim();
  const row = db
    .prepare(
      `select
         r.id,
         r.return_number as returnNumber,
         r.status,
         r.refund_total as refundTotal,
         r.refund_method as refundMethod,
         r.sale_id as saleId,
         coalesce(s.sale_number, '—') as saleNumber,
         coalesce(r.issued_by_name, r.processed_by_name, '') as issuedByName,
         r.refunded_by_name as refundedByName,
         r.refunded_at as refundedAt,
         (
           select count(*) from sale_return_lines l
           where l.sale_return_id = r.id and l.tenant_id = r.tenant_id
         ) as lineCount
       from sale_returns r
       left join sales s on s.id = r.sale_id
       where r.tenant_id = @tenantId and r.return_number = @returnNumber`,
    )
    .get({ tenantId: DEMO_STORE_TENANT_ID, returnNumber: trimmed }) as
    | Record<string, unknown>
    | undefined;

  if (!row) {
    throw new Error("Return voucher not found");
  }

  const status = String(row.status) as SaleReturnLookupSummary["status"];
  if (status === "COMPLETED") {
    const cashierName =
      String(row.refundedByName ?? "").trim() || "cashier";
    throw new Error(`Already processed by ${cashierName}`);
  }

  return {
    id: String(row.id),
    returnNumber: String(row.returnNumber),
    status,
    refundTotal: Number(row.refundTotal),
    refundMethod: row.refundMethod as SaleReturnLookupSummary["refundMethod"],
    saleId: String(row.saleId),
    saleNumber: String(row.saleNumber),
    issuedByName: String(row.issuedByName ?? "").trim() || null,
    refundedByName: null,
    refundedAt: null,
    lineCount: Number(row.lineCount),
  };
}

export function completeSaleReturnStandaloneLocal(input: {
  returnId: string;
  userId: string;
  userName: string;
}): SaleReturnDetail {
  const db = getLocalDb();
  const row = db
    .prepare(
      `select id, status, refund_total as refundTotal, refunded_by_name as refundedByName
       from sale_returns
       where id = ? and tenant_id = ?`,
    )
    .get(input.returnId, DEMO_STORE_TENANT_ID) as
    | { id: string; status: string; refundTotal: number; refundedByName: string | null }
    | undefined;

  if (!row) throw new Error("Return voucher not found");
  if (row.status === "COMPLETED") {
    throw new Error(
      `Already processed by ${row.refundedByName?.trim() || "cashier"}`,
    );
  }
  if (row.status !== "PENDING") {
    throw new Error("Return is not pending refund");
  }

  const now = new Date().toISOString();
  db.prepare(
    `update sale_returns
     set status = 'COMPLETED',
         refunded_by = @userId,
         refunded_by_name = @userName,
         refunded_at = @now,
         completion_mode = 'STANDALONE_CASH',
         updated_at = @now
     where id = @returnId and tenant_id = @tenantId`,
  ).run({
    returnId: input.returnId,
    tenantId: DEMO_STORE_TENANT_ID,
    userId: input.userId,
    userName: input.userName,
    now,
  });

  const detail = getSaleReturnLocal(input.returnId);
  if (!detail) throw new Error("Return voucher not found");
  return detail;
}

export function completeSaleReturnWithSaleLocal(input: {
  returnId: string;
  saleId: string;
  userId: string;
  userName: string;
}): SaleReturnDetail {
  const db = getLocalDb();
  const row = db
    .prepare(`select id, status from sale_returns where id = ? and tenant_id = ?`)
    .get(input.returnId, DEMO_STORE_TENANT_ID) as
    | { id: string; status: string }
    | undefined;

  if (!row) throw new Error("Return voucher not found");
  if (row.status !== "PENDING") {
    throw new Error("Return is not pending refund");
  }

  const now = new Date().toISOString();
  db.prepare(
    `update sale_returns
     set status = 'COMPLETED',
         refunded_by = @userId,
         refunded_by_name = @userName,
         refunded_at = @now,
         applied_to_sale_id = @saleId,
         completion_mode = 'SALE_OFFSET',
         updated_at = @now
     where id = @returnId and tenant_id = @tenantId`,
  ).run({
    returnId: input.returnId,
    saleId: input.saleId,
    tenantId: DEMO_STORE_TENANT_ID,
    userId: input.userId,
    userName: input.userName,
    now,
  });

  const detail = getSaleReturnLocal(input.returnId);
  if (!detail) throw new Error("Return voucher not found");
  return detail;
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

export type SaleReturnCreditForSale = {
  returnNumber: string;
  amount: number;
};

export function getSaleReturnCreditForSaleLocal(
  saleId: string,
): SaleReturnCreditForSale | null {
  const db = getLocalDb();
  const row = db
    .prepare(
      `select return_number as returnNumber, refund_total as refundTotal
       from sale_returns
       where tenant_id = @tenantId
         and applied_to_sale_id = @saleId
         and status = 'COMPLETED'
         and completion_mode = 'SALE_OFFSET'
       limit 1`,
    )
    .get({ tenantId: DEMO_STORE_TENANT_ID, saleId }) as
    | { returnNumber: string; refundTotal: number }
    | undefined;

  if (!row) return null;
  return {
    returnNumber: String(row.returnNumber),
    amount: Number(row.refundTotal),
  };
}

export function resolveSaleReturnByNumberLocal(
  returnNumber: string,
): { id: string; returnNumber: string } | null {
  const db = getLocalDb();
  const trimmed = returnNumber.trim();
  if (!trimmed) return null;

  const row = db
    .prepare(
      `select id, return_number as returnNumber
       from sale_returns
       where tenant_id = @tenantId and lower(return_number) = lower(@returnNumber)
       limit 1`,
    )
    .get({ tenantId: DEMO_STORE_TENANT_ID, returnNumber: trimmed }) as
    | { id: string; returnNumber: string }
    | undefined;

  return row ?? null;
}
