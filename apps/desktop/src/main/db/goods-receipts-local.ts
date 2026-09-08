import type { GoodsReceiptDetail } from "@blackbox/shared";
import { DEMO_STORE_TENANT_ID } from "@blackbox/shared";
import { getLocalDb } from "./index";

export function upsertGoodsReceiptLocal(detail: GoodsReceiptDetail): void {
  const db = getLocalDb();
  const tx = db.transaction(() => {
    db.prepare(
      `insert into goods_receipts (
        id, tenant_id, receipt_number, purchase_order_id, vendor_id, warehouse_id,
        status, received_at, voucher_number, subtotal, discount, tax, adv_tax, gst,
        incentive, shelf_rent, other_charges, return_credit, total, notes,
        created_at, updated_at, sync_status, server_updated_at
      ) values (
        @id, @tenantId, @receiptNumber, @purchaseOrderId, @vendorId, @warehouseId,
        @status, @receivedAt, @voucherNumber, @subtotal, @discount, @tax, @advTax, @gst,
        @incentive, @shelfRent, @otherCharges, @returnCredit, @total, @notes,
        @createdAt, @updatedAt, 'synced', @serverUpdatedAt
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
        adv_tax = excluded.adv_tax,
        gst = excluded.gst,
        incentive = excluded.incentive,
        shelf_rent = excluded.shelf_rent,
        other_charges = excluded.other_charges,
        return_credit = excluded.return_credit,
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
      tax: detail.saleTax,
      advTax: detail.advTax,
      gst: detail.gst,
      incentive: detail.incentive,
      shelfRent: detail.shelfRent,
      otherCharges: 0,
      returnCredit: detail.returnCredit ?? 0,
      total: detail.total,
      notes: "",
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
        received_quantity, bonus_quantity, po_unit_cost, receiving_unit_cost, discount_percent, line_total,
        created_at, updated_at, sync_status, server_updated_at
      ) values (
        @id, @tenantId, @goodsReceiptId, @purchaseOrderItemId, @productSkuId,
        @vendorSkuId, @purchaseUnitId, @unitsPerPurchaseUnit, @orderedQuantity,
        @receivedQuantity, @bonusQuantity, @poUnitCost, @receivingUnitCost, @discountPercent, @lineTotal,
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
        bonusQuantity: item.bonusQuantity ?? 0,
        poUnitCost: item.poUnitCost,
        receivingUnitCost: item.receivingUnitCost,
        discountPercent: item.discountPercent ?? 0,
        lineTotal: item.lineTotal,
        createdAt: detail.updatedAt,
        updatedAt: detail.updatedAt,
        serverUpdatedAt: detail.updatedAt,
      });
    }
  });
  tx();
}

export function upsertGoodsReceiptsLocal(rows: GoodsReceiptDetail[]): void {
  const db = getLocalDb();
  const tx = db.transaction(() => {
    for (const row of rows) upsertGoodsReceiptLocal(row);
  });
  tx();
}
