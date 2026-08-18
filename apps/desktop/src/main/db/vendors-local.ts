import type { VendorDetail, VendorSku } from "@blackbox/shared";
import { getLocalDb } from "./index";

function nowIso(): string {
  return new Date().toISOString();
}

export function upsertVendorLocal(detail: VendorDetail): void {
  const db = getLocalDb();
  const ts = nowIso();
  const tx = db.transaction(() => {
    db.prepare(
      `insert into vendors (
        id, tenant_id, name, vendor_code, group_id, address, city, state, country,
        postal_code, sales_target, credit_limit, payment_terms, tax_number, notes,
        status, created_at, updated_at, sync_status, server_updated_at
      ) values (
        @id, @tenantId, @name, @vendorCode, @groupId, @address, @city, @state, @country,
        @postalCode, @salesTarget, @creditLimit, @paymentTerms, @taxNumber, @notes,
        @status, @createdAt, @updatedAt, 'synced', @serverUpdatedAt
      )
      on conflict(id) do update set
        name = excluded.name,
        vendor_code = excluded.vendor_code,
        group_id = excluded.group_id,
        address = excluded.address,
        city = excluded.city,
        state = excluded.state,
        country = excluded.country,
        postal_code = excluded.postal_code,
        sales_target = excluded.sales_target,
        credit_limit = excluded.credit_limit,
        payment_terms = excluded.payment_terms,
        tax_number = excluded.tax_number,
        notes = excluded.notes,
        status = excluded.status,
        updated_at = excluded.updated_at,
        sync_status = 'synced',
        server_updated_at = excluded.server_updated_at`,
    ).run({
      id: detail.id,
      tenantId: "a0000000-0000-4000-8000-000000000001",
      name: detail.name,
      vendorCode: detail.vendorCode,
      groupId: detail.groupId,
      address: detail.address,
      city: detail.city,
      state: detail.state,
      country: detail.country,
      postalCode: detail.postalCode,
      salesTarget: detail.salesTarget,
      creditLimit: detail.creditLimit,
      paymentTerms: detail.paymentTerms,
      taxNumber: detail.taxNumber,
      notes: detail.notes,
      status: detail.status,
      createdAt: detail.createdAt,
      updatedAt: detail.updatedAt,
      serverUpdatedAt: detail.updatedAt,
    });

    db.prepare("delete from vendor_contacts where vendor_id = ?").run(detail.id);
    const insertContact = db.prepare(
      `insert into vendor_contacts (
        id, tenant_id, vendor_id, contact_type, name, phone, email,
        created_at, updated_at, sync_status, server_updated_at
      ) values (
        @id, @tenantId, @vendorId, @contactType, @name, @phone, @email,
        @createdAt, @updatedAt, 'synced', @serverUpdatedAt
      )`,
    );
    for (const c of detail.contacts) {
      insertContact.run({
        id: c.id,
        tenantId: "a0000000-0000-4000-8000-000000000001",
        vendorId: detail.id,
        contactType: c.contactType,
        name: c.name,
        phone: c.phone,
        email: c.email,
        createdAt: ts,
        updatedAt: ts,
        serverUpdatedAt: ts,
      });
    }
  });
  tx();
}

export function upsertVendorSkuLocal(row: VendorSku): void {
  const db = getLocalDb();
  const ts = nowIso();
  db.prepare(
    `insert into vendor_skus (
      id, tenant_id, vendor_id, product_sku_id, vendor_sku_code, purchase_unit_id,
      units_per_purchase_unit, purchase_price, minimum_order_quantity, lead_time_days,
      is_preferred, status, notes, created_at, updated_at, sync_status, server_updated_at
    ) values (
      @id, @tenantId, @vendorId, @productSkuId, @vendorSkuCode, @purchaseUnitId,
      @unitsPerPurchaseUnit, @purchasePrice, @minimumOrderQuantity, @leadTimeDays,
      @isPreferred, @status, @notes, @createdAt, @updatedAt, 'synced', @serverUpdatedAt
    )
    on conflict(id) do update set
      vendor_sku_code = excluded.vendor_sku_code,
      purchase_unit_id = excluded.purchase_unit_id,
      units_per_purchase_unit = excluded.units_per_purchase_unit,
      purchase_price = excluded.purchase_price,
      minimum_order_quantity = excluded.minimum_order_quantity,
      lead_time_days = excluded.lead_time_days,
      is_preferred = excluded.is_preferred,
      status = excluded.status,
      notes = excluded.notes,
      updated_at = excluded.updated_at,
      sync_status = 'synced',
      server_updated_at = excluded.server_updated_at`,
  ).run({
    id: row.id,
    tenantId: "a0000000-0000-4000-8000-000000000001",
    vendorId: row.vendorId,
    productSkuId: row.productSkuId,
    vendorSkuCode: row.vendorSkuCode,
    purchaseUnitId: row.purchaseUnitId,
    unitsPerPurchaseUnit: row.unitsPerPurchaseUnit,
    purchasePrice: row.purchasePrice,
    minimumOrderQuantity: row.minimumOrderQuantity,
    leadTimeDays: row.leadTimeDays,
    isPreferred: row.isPreferred ? 1 : 0,
    status: row.status,
    notes: row.notes,
    createdAt: ts,
    updatedAt: ts,
    serverUpdatedAt: ts,
  });
}

export function deactivateVendorSkuLocal(id: string): void {
  const db = getLocalDb();
  db.prepare(
    `update vendor_skus set status = 'inactive', updated_at = ?, sync_status = 'synced' where id = ?`,
  ).run(nowIso(), id);
}
