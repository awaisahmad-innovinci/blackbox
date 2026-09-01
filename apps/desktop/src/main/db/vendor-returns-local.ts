import type { VendorReturnDetail } from "@blackbox/shared";
import { DEMO_STORE_TENANT_ID } from "@blackbox/shared";
import { getLocalDb } from "./index";

export function upsertVendorReturnLocal(detail: VendorReturnDetail): void {
  const db = getLocalDb();
  const tx = db.transaction(() => {
    db.prepare(
      `insert into vendor_returns (
        id, tenant_id, return_number, vendor_id, warehouse_id, return_date,
        notes, status, subtotal, total, created_at, updated_at, sync_status,
        server_updated_at
      ) values (
        @id, @tenantId, @returnNumber, @vendorId, @warehouseId, @returnDate,
        @notes, @status, @subtotal, @total, @createdAt, @updatedAt, 'synced',
        @serverUpdatedAt
      )
      on conflict(id) do update set
        return_number = excluded.return_number,
        vendor_id = excluded.vendor_id,
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
      vendorId: detail.vendorId,
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

    db.prepare("delete from vendor_return_items where vendor_return_id = ?").run(
      detail.id,
    );

    const insertItem = db.prepare(
      `insert into vendor_return_items (
        id, tenant_id, vendor_return_id, product_sku_id, vendor_sku_id,
        purchase_unit_id, units_per_purchase_unit, quantity, unit_cost, reason,
        settlement, goods_receipt_id, created_at, updated_at, sync_status,
        server_updated_at
      ) values (
        @id, @tenantId, @vendorReturnId, @productSkuId, @vendorSkuId,
        @purchaseUnitId, @unitsPerPurchaseUnit, @quantity, @unitCost, @reason,
        @settlement, @goodsReceiptId, @createdAt, @updatedAt, 'synced',
        @serverUpdatedAt
      )`,
    );

    for (const item of detail.items) {
      insertItem.run({
        id: item.id,
        tenantId: DEMO_STORE_TENANT_ID,
        vendorReturnId: detail.id,
        productSkuId: item.productSkuId,
        vendorSkuId: item.vendorSkuId,
        purchaseUnitId: item.purchaseUnitId,
        unitsPerPurchaseUnit: item.unitsPerPurchaseUnit,
        quantity: item.quantity,
        unitCost: item.unitCost,
        reason: item.reason,
        settlement: item.settlement,
        goodsReceiptId: item.goodsReceiptId,
        createdAt: detail.updatedAt,
        updatedAt: detail.updatedAt,
        serverUpdatedAt: detail.updatedAt,
      });
    }
  });
  tx();
}

export function upsertVendorReturnsLocal(rows: VendorReturnDetail[]): void {
  const db = getLocalDb();
  const tx = db.transaction(() => {
    for (const row of rows) upsertVendorReturnLocal(row);
  });
  tx();
}
