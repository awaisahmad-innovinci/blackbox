import type { GoodsReceiptDetail } from "@blackbox/shared";
import { DEMO_STORE_TENANT_ID } from "@blackbox/shared";
import { getLocalDb } from "./index";

export function upsertGoodsReceiptLocal(detail: GoodsReceiptDetail): void {
  const db = getLocalDb();
  const tx = db.transaction(() => {
    db.prepare(
      `insert into goods_receipts (
        id, tenant_id, receipt_number, purchase_order_id, vendor_id, warehouse_id,
        status, received_at, voucher_number, subtotal, discount, tax, other_charges,
        total, notes, created_at, updated_at, sync_status, server_updated_at
      ) values (
        @id, @tenantId, @receiptNumber, @purchaseOrderId, @vendorId, @warehouseId,
        @status, @receivedAt, @voucherNumber, @subtotal, @discount, @tax, @otherCharges,
        @total, @notes, @createdAt, @updatedAt, 'synced', @serverUpdatedAt
      )
      on conflict(id) do update set
        receipt_number = excluded.receipt_number,
        purchase_order_id = excluded.purchase_order_id,
        vendor_id = excluded.vendor_id,
        warehouse_id = excluded.warehouse_id,
        status = excluded.status,
        received_at = excluded.received_at,
        voucher_number = excluded.voucher_number,
        subtotal = excluded.subtotal,
        discount = excluded.discount,
        tax = excluded.tax,
        other_charges = excluded.other_charges,
        total = excluded.total,
        notes = excluded.notes,
        updated_at = excluded.updated_at,
        sync_status = 'synced',
        server_updated_at = excluded.server_updated_at`,
    ).run({
      id: detail.id,
      tenantId: DEMO_STORE_TENANT_ID,
      receiptNumber: detail.receiptNumber,
      purchaseOrderId: detail.purchaseOrderId,
      vendorId: detail.vendorId,
      warehouseId: detail.warehouseId,
      status: detail.status,
      receivedAt: detail.receivedAt,
      voucherNumber: detail.voucherNumber,
      subtotal: detail.subtotal,
      discount: detail.discount,
      tax: detail.tax,
      otherCharges: detail.otherCharges,
      total: detail.total,
      notes: detail.notes,
      createdAt: detail.createdAt,
      updatedAt: detail.updatedAt,
      serverUpdatedAt: detail.updatedAt,
    });

    db.prepare(
      "delete from goods_receipt_items where goods_receipt_id = ?",
    ).run(detail.id);

    const insertItem = db.prepare(
      `insert into goods_receipt_items (
        id, tenant_id, goods_receipt_id, purchase_order_item_id, product_sku_id,
        vendor_sku_id, purchase_unit_id, units_per_purchase_unit, ordered_quantity,
        received_quantity, po_unit_cost, receiving_unit_cost, line_total,
        created_at, updated_at, sync_status, server_updated_at
      ) values (
        @id, @tenantId, @goodsReceiptId, @purchaseOrderItemId, @productSkuId,
        @vendorSkuId, @purchaseUnitId, @unitsPerPurchaseUnit, @orderedQuantity,
        @receivedQuantity, @poUnitCost, @receivingUnitCost, @lineTotal,
        @createdAt, @updatedAt, 'synced', @serverUpdatedAt
      )`,
    );

    for (const item of detail.items) {
      insertItem.run({
        id: item.id,
        tenantId: DEMO_STORE_TENANT_ID,
        goodsReceiptId: detail.id,
        purchaseOrderItemId: item.purchaseOrderItemId,
        productSkuId: item.productSkuId,
        vendorSkuId: item.vendorSkuId,
        purchaseUnitId: item.purchaseUnitId,
        unitsPerPurchaseUnit: item.unitsPerPurchaseUnit,
        orderedQuantity: item.orderedQuantity,
        receivedQuantity: item.receivedQuantity,
        poUnitCost: item.poUnitCost,
        receivingUnitCost: item.receivingUnitCost,
        lineTotal: item.lineTotal,
        createdAt: detail.updatedAt,
        updatedAt: detail.updatedAt,
        serverUpdatedAt: detail.updatedAt,
      });
    }
  });
  tx();
}
