import type { PurchaseOrderDetail } from "@blackbox/shared";
import { DEMO_STORE_TENANT_ID } from "@blackbox/shared";
import { getLocalDb } from "./index";

export function upsertPurchaseOrderLocal(detail: PurchaseOrderDetail): void {
  const db = getLocalDb();
  const tx = db.transaction(() => {
    db.prepare(
      `insert into purchase_orders (
        id, tenant_id, po_number, vendor_id, warehouse_id, status, order_date,
        expected_date, subtotal, discount, tax, other_charges, total, notes,
        created_at, updated_at, sync_status, server_updated_at
      ) values (
        @id, @tenantId, @poNumber, @vendorId, @warehouseId, @status, @orderDate,
        @expectedDate, @subtotal, @discount, @tax, @otherCharges, @total, @notes,
        @createdAt, @updatedAt, 'synced', @serverUpdatedAt
      )
      on conflict(id) do update set
        po_number = excluded.po_number,
        vendor_id = excluded.vendor_id,
        warehouse_id = excluded.warehouse_id,
        status = excluded.status,
        order_date = excluded.order_date,
        expected_date = excluded.expected_date,
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
      poNumber: detail.poNumber,
      vendorId: detail.vendorId,
      warehouseId: detail.warehouseId,
      status: detail.status,
      orderDate: detail.orderDate,
      expectedDate: detail.expectedDate,
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

    db.prepare("delete from purchase_order_items where purchase_order_id = ?").run(
      detail.id,
    );

    const insertItem = db.prepare(
      `insert into purchase_order_items (
        id, tenant_id, purchase_order_id, product_sku_id, vendor_sku_id,
        purchase_unit_id, units_per_purchase_unit, quantity, unit_cost, tax,
        discount, line_total, created_at, updated_at, sync_status, server_updated_at
      ) values (
        @id, @tenantId, @purchaseOrderId, @productSkuId, @vendorSkuId,
        @purchaseUnitId, @unitsPerPurchaseUnit, @quantity, @unitCost, @tax,
        @discount, @lineTotal, @createdAt, @updatedAt, 'synced', @serverUpdatedAt
      )`,
    );

    for (const item of detail.items) {
      insertItem.run({
        id: item.id,
        tenantId: DEMO_STORE_TENANT_ID,
        purchaseOrderId: detail.id,
        productSkuId: item.productSkuId,
        vendorSkuId: item.vendorSkuId || null,
        purchaseUnitId: item.purchaseUnitId,
        unitsPerPurchaseUnit: item.unitsPerPurchaseUnit,
        quantity: item.quantity,
        unitCost: item.unitCost,
        tax: item.tax,
        discount: item.discount,
        lineTotal: item.lineTotal,
        createdAt: detail.updatedAt,
        updatedAt: detail.updatedAt,
        serverUpdatedAt: detail.updatedAt,
      });
    }
  });
  tx();
}
