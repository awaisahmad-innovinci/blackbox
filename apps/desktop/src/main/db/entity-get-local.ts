import type {
  EntityStatus,
  GoodsReceiptDetail,
  GoodsReceiptStatus,
  InventoryMovementType,
  InventoryOutDetail,
  InventoryOutStatus,
  InventoryInOutReport,
  InventoryMovementListItem,
  PaymentTerms,
  ProductDetail,
  ProductSkuDetail,
  ProductSupplierRow,
  ProductType,
  PurchaseOrderDetail,
  PurchaseOrderItemRow,
  PurchaseOrderStatus,
  ReceivingDraft,
  ReceivingLineDraft,
  SkuBarcodeLookupResult,
  SkuBarcode,
  SkuDetail,
  SkuSearchResult,
  SkuSupplier,
  StockMovementRow,
  VendorContact,
  VendorContactType,
  VendorDetail,
  VendorReturnDetail,
  VendorReturnReason,
  VendorReturnSettlement,
  VendorReturnStatus,
  VendorSku,
  WarehouseStockRow,
} from "@blackbox/shared";
import { DEMO_STORE_TENANT_ID } from "@blackbox/shared";
import { getLocalDb } from "./index";
import {
  findBarcodeMatchLocal,
  findSkuIdByBarcodeLocal,
  listSkuBarcodesLocal,
} from "./sku-barcodes-local";

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function numOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export type ProductProfileLocal = {
  product: ProductDetail;
  skus: ProductSkuDetail[];
  suppliers: ProductSupplierRow[];
  inventory: WarehouseStockRow[];
  movements: StockMovementRow[];
};

export type VendorProfileLocal = {
  vendor: VendorDetail;
  skus: VendorSku[];
};

export type SkuProfileLocal = {
  sku: SkuDetail;
  suppliers: SkuSupplier[];
  inventory: WarehouseStockRow[];
};

export function getProductLocal(id: string): ProductDetail | null {
  const db = getLocalDb();
  const row = db
    .prepare(
      `select
         p.id,
         p.name,
         coalesce(p.product_code, '') as productCode,
         p.brand_id as brandId,
         b.name as brandName,
         p.category_id as categoryId,
         c.name as categoryName,
         p.product_type as productType,
         coalesce(p.description, '') as description,
         p.image_path as imagePath,
         p.status,
         p.created_at as createdAt,
         p.updated_at as updatedAt,
         coalesce((
           select sum(st.quantity_on_hand)
           from inventory_stock st
           inner join product_skus s on s.id = st.product_sku_id
           where s.product_id = p.id and st.tenant_id = p.tenant_id
         ), 0) as totalOnHand,
         coalesce((
           select sum(st.quantity_reserved)
           from inventory_stock st
           inner join product_skus s on s.id = st.product_sku_id
           where s.product_id = p.id and st.tenant_id = p.tenant_id
         ), 0) as totalReserved,
         coalesce((
           select sum(st.quantity_available)
           from inventory_stock st
           inner join product_skus s on s.id = st.product_sku_id
           where s.product_id = p.id and st.tenant_id = p.tenant_id
         ), 0) as totalAvailable
       from products p
       left join brands b on b.id = p.brand_id
       left join categories c on c.id = p.category_id
       where p.id = ? and p.tenant_id = ?`,
    )
    .get(id, DEMO_STORE_TENANT_ID) as
    | {
        id: string;
        name: string;
        productCode: string;
        brandId: string | null;
        brandName: string | null;
        categoryId: string | null;
        categoryName: string | null;
        productType: string;
        description: string;
        imagePath: string | null;
        status: string;
        createdAt: string;
        updatedAt: string;
        totalOnHand: number;
        totalReserved: number;
        totalAvailable: number;
      }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    productCode: row.productCode,
    brandId: row.brandId,
    brandName: row.brandName,
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    productType: row.productType as ProductType,
    description: row.description,
    imagePath: row.imagePath,
    status: row.status as EntityStatus,
    totalOnHand: num(row.totalOnHand),
    totalReserved: num(row.totalReserved),
    totalAvailable: num(row.totalAvailable),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function listProductSkusLocal(productId: string): ProductSkuDetail[] {
  const db = getLocalDb();
  const rows = db
    .prepare(
      `select
         s.id,
         s.product_id as productId,
         s.variant_name as variantName,
         s.sku,
         s.barcode,
         s.size_value as sizeValue,
         s.size_unit as sizeUnit,
         s.base_unit_id as baseUnitId,
         bu.name as baseUnitName,
         s.purchase_unit_id as purchaseUnitId,
         pu.name as purchaseUnitName,
         s.units_per_purchase_unit as unitsPerPurchaseUnit,
         s.cost_price as costPrice,
         s.selling_price as sellingPrice,
         s.selling_price_per_purchase_unit as sellingPricePerPurchaseUnit,
         s.reorder_level as reorderLevel,
         s.minimum_stock_level as minimumStockLevel,
         s.maximum_stock_level as maximumStockLevel,
         s.track_inventory as trackInventory,
         s.status
       from product_skus s
       left join units bu on bu.id = s.base_unit_id
       left join units pu on pu.id = s.purchase_unit_id
       where s.product_id = ? and s.tenant_id = ?
       order by s.sku collate nocase`,
    )
    .all(productId, DEMO_STORE_TENANT_ID) as Array<Record<string, unknown>>;
  return rows.map(mapProductSkuRow);
}

export function listSkuCodesLocal(): string[] {
  const db = getLocalDb();
  const rows = db
    .prepare(`select sku from product_skus where tenant_id = ?`)
    .all(DEMO_STORE_TENANT_ID) as Array<{ sku: string }>;
  return rows.map((row) => String(row.sku));
}

function mapProductSkuRow(r: Record<string, unknown>): ProductSkuDetail {
  return {
    id: String(r.id),
    productId: String(r.productId),
    variantName: String(r.variantName ?? ""),
    sku: String(r.sku),
    barcode: (r.barcode as string | null) ?? null,
    sizeValue: (r.sizeValue as string | null) ?? null,
    sizeUnit: (r.sizeUnit as string | null) ?? null,
    baseUnitId: (r.baseUnitId as string | null) ?? null,
    baseUnitName: (r.baseUnitName as string | null) ?? null,
    purchaseUnitId: (r.purchaseUnitId as string | null) ?? null,
    purchaseUnitName: (r.purchaseUnitName as string | null) ?? null,
    unitsPerPurchaseUnit: num(r.unitsPerPurchaseUnit, 1),
    costPrice: num(r.costPrice),
    sellingPrice: num(r.sellingPrice),
    sellingPricePerPurchaseUnit: numOrNull(r.sellingPricePerPurchaseUnit),
    reorderLevel: num(r.reorderLevel),
    minimumStockLevel: num(r.minimumStockLevel),
    maximumStockLevel: numOrNull(r.maximumStockLevel),
    trackInventory: Boolean(r.trackInventory),
    status: r.status as EntityStatus,
  };
}

export function listProductSuppliersLocal(
  productId: string,
): ProductSupplierRow[] {
  const db = getLocalDb();
  const rows = db
    .prepare(
      `select
         vs.id as vendorSkuId,
         vs.product_sku_id as productSkuId,
         s.sku,
         s.variant_name as variantName,
         vs.vendor_id as vendorId,
         v.name as vendorName,
         vs.vendor_sku_code as vendorSkuCode,
         vs.purchase_price as purchasePrice,
         vs.minimum_order_quantity as minimumOrderQuantity,
         vs.lead_time_days as leadTimeDays,
         vs.is_preferred as isPreferred
       from vendor_skus vs
       inner join product_skus s on s.id = vs.product_sku_id
       inner join vendors v on v.id = vs.vendor_id
       where s.product_id = ? and vs.tenant_id = ? and vs.status = 'active'
       order by v.name collate nocase, s.sku collate nocase`,
    )
    .all(productId, DEMO_STORE_TENANT_ID) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    vendorSkuId: String(r.vendorSkuId),
    productSkuId: String(r.productSkuId),
    sku: String(r.sku),
    variantName: String(r.variantName ?? ""),
    vendorId: String(r.vendorId),
    vendorName: String(r.vendorName),
    vendorSkuCode: (r.vendorSkuCode as string | null) ?? null,
    purchasePrice: num(r.purchasePrice),
    minimumOrderQuantity: num(r.minimumOrderQuantity),
    leadTimeDays: num(r.leadTimeDays),
    isPreferred: Boolean(r.isPreferred),
  }));
}

export function listProductInventoryLocal(
  productId: string,
): WarehouseStockRow[] {
  const db = getLocalDb();
  const rows = db
    .prepare(
      `select
         st.warehouse_id as warehouseId,
         w.name as warehouseName,
         st.product_sku_id as productSkuId,
         s.sku,
         s.variant_name as variantName,
         st.quantity_on_hand as quantityOnHand,
         st.quantity_reserved as quantityReserved,
         st.quantity_available as quantityAvailable
       from inventory_stock st
       inner join product_skus s on s.id = st.product_sku_id
       inner join warehouses w on w.id = st.warehouse_id
       where s.product_id = ? and st.tenant_id = ?
       order by w.name collate nocase, s.sku collate nocase`,
    )
    .all(productId, DEMO_STORE_TENANT_ID) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    warehouseId: String(r.warehouseId),
    warehouseName: String(r.warehouseName),
    productSkuId: String(r.productSkuId),
    sku: String(r.sku),
    variantName: String(r.variantName ?? ""),
    quantityOnHand: num(r.quantityOnHand),
    quantityReserved: num(r.quantityReserved),
    quantityAvailable: num(r.quantityAvailable),
  }));
}

export function listProductMovementsLocal(
  productId: string,
  limit = 50,
): StockMovementRow[] {
  const db = getLocalDb();
  const rows = db
    .prepare(
      `select
         m.id,
         m.product_sku_id as productSkuId,
         s.sku,
         s.variant_name as variantName,
         m.warehouse_id as warehouseId,
         w.name as warehouseName,
         m.movement_type as movementType,
         m.quantity,
         m.reason,
         m.created_at as createdAt
       from inventory_movements m
       inner join product_skus s on s.id = m.product_sku_id
       inner join warehouses w on w.id = m.warehouse_id
       where s.product_id = ? and m.tenant_id = ?
       order by m.created_at desc
       limit ?`,
    )
    .all(productId, DEMO_STORE_TENANT_ID, Math.min(limit, 100)) as Array<
    Record<string, unknown>
  >;
  return rows.map((r) => ({
    id: String(r.id),
    productSkuId: String(r.productSkuId),
    sku: String(r.sku),
    variantName: String(r.variantName ?? ""),
    warehouseId: String(r.warehouseId),
    warehouseName: String(r.warehouseName),
    movementType: r.movementType as InventoryMovementType,
    quantity: num(r.quantity),
    reason: String(r.reason ?? ""),
    createdAt: String(r.createdAt),
  }));
}

export function getProductProfileLocal(id: string): ProductProfileLocal | null {
  const product = getProductLocal(id);
  if (!product) return null;
  return {
    product,
    skus: listProductSkusLocal(id),
    suppliers: listProductSuppliersLocal(id),
    inventory: listProductInventoryLocal(id),
    movements: listProductMovementsLocal(id),
  };
}

export function getVendorLocal(id: string): VendorDetail | null {
  const db = getLocalDb();
  const row = db
    .prepare(
      `select
         v.id,
         v.name,
         v.vendor_code as vendorCode,
         v.group_id as groupId,
         g.name as groupName,
         v.status,
         v.address,
         v.city,
         v.state,
         v.country,
         v.postal_code as postalCode,
         v.sales_target as salesTarget,
         v.credit_limit as creditLimit,
         v.payment_terms as paymentTerms,
         v.tax_number as taxNumber,
         coalesce(v.notes, '') as notes,
         v.created_at as createdAt,
         v.updated_at as updatedAt
       from vendors v
       left join vendor_groups g on g.id = v.group_id
       where v.id = ? and v.tenant_id = ?`,
    )
    .get(id, DEMO_STORE_TENANT_ID) as
    | {
        id: string;
        name: string;
        vendorCode: string;
        groupId: string | null;
        groupName: string | null;
        status: string;
        address: string | null;
        city: string | null;
        state: string | null;
        country: string | null;
        postalCode: string | null;
        salesTarget: number | null;
        creditLimit: number | null;
        paymentTerms: string | null;
        taxNumber: string | null;
        notes: string;
        createdAt: string;
        updatedAt: string;
      }
    | undefined;
  if (!row) return null;

  const contacts = db
    .prepare(
      `select id, contact_type as contactType, name, phone, email
       from vendor_contacts
       where vendor_id = ? and tenant_id = ?
       order by contact_type`,
    )
    .all(id, DEMO_STORE_TENANT_ID) as Array<{
    id: string;
    contactType: string;
    name: string | null;
    phone: string | null;
    email: string | null;
  }>;

  return {
    id: row.id,
    name: row.name,
    vendorCode: row.vendorCode,
    groupId: row.groupId,
    groupName: row.groupName,
    status: row.status as EntityStatus,
    address: row.address,
    city: row.city,
    state: row.state,
    country: row.country,
    postalCode: row.postalCode,
    salesTarget: numOrNull(row.salesTarget),
    creditLimit: numOrNull(row.creditLimit),
    paymentTerms: (row.paymentTerms as PaymentTerms | null) ?? null,
    taxNumber: row.taxNumber,
    notes: row.notes,
    contacts: contacts.map(
      (c): VendorContact => ({
        id: c.id,
        contactType: c.contactType as VendorContactType,
        name: c.name,
        phone: c.phone,
        email: c.email,
      }),
    ),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function listVendorSkusLocal(
  vendorId: string,
  options?: { q?: string; warehouseId?: string; activeOnly?: boolean },
): VendorSku[] {
  const db = getLocalDb();
  const q = options?.q?.trim().toLowerCase() ?? "";
  const warehouseId = options?.warehouseId ?? "";
  const activeOnly = Boolean(options?.activeOnly);
  const rows = db
    .prepare(
      `select
         vs.id,
         vs.vendor_id as vendorId,
         vs.product_sku_id as productSkuId,
         vs.vendor_sku_code as vendorSkuCode,
         vs.purchase_price as purchasePrice,
         vs.purchase_unit_id as purchaseUnitId,
         pu.name as purchaseUnitName,
         vs.units_per_purchase_unit as unitsPerPurchaseUnit,
         vs.minimum_order_quantity as minimumOrderQuantity,
         vs.lead_time_days as leadTimeDays,
         vs.is_preferred as isPreferred,
         vs.status,
         coalesce(vs.notes, '') as notes,
         p.name as productName,
         s.variant_name as variantName,
         s.sku,
         s.barcode,
         st.quantity_available as quantityAvailable
       from vendor_skus vs
       inner join product_skus s on s.id = vs.product_sku_id
       inner join products p on p.id = s.product_id
       left join units pu on pu.id = vs.purchase_unit_id
       left join inventory_stock st
         on st.product_sku_id = vs.product_sku_id
        and st.warehouse_id = @warehouseId
        and st.tenant_id = vs.tenant_id
        and @warehouseId != ''
       where vs.vendor_id = @vendorId
         and vs.tenant_id = @tenantId
         and (@activeOnly = 0 or vs.status = 'active')
         and (@activeOnly = 0 or s.status = 'active')
         and (
           @q = ''
           or lower(p.name) like '%' || @q || '%'
           or lower(s.variant_name) like '%' || @q || '%'
           or lower(s.sku) like '%' || @q || '%'
           or lower(coalesce(s.barcode, '')) like '%' || @q || '%'
           or lower(coalesce(vs.vendor_sku_code, '')) like '%' || @q || '%'
           or exists (
             select 1 from product_sku_barcodes b
             where b.product_sku_id = s.id
               and b.tenant_id = s.tenant_id
               and b.status = 'active'
               and lower(b.barcode) like '%' || @q || '%'
           )
         )
       order by p.name collate nocase, s.sku collate nocase`,
    )
    .all({
      vendorId,
      tenantId: DEMO_STORE_TENANT_ID,
      warehouseId,
      activeOnly: activeOnly ? 1 : 0,
      q,
    }) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: String(r.id),
    vendorId: String(r.vendorId),
    productSkuId: String(r.productSkuId),
    vendorSkuCode: (r.vendorSkuCode as string | null) ?? null,
    purchasePrice: num(r.purchasePrice),
    purchaseUnitId: (r.purchaseUnitId as string | null) ?? null,
    purchaseUnitName: (r.purchaseUnitName as string | null) ?? null,
    unitsPerPurchaseUnit: num(r.unitsPerPurchaseUnit, 1),
    minimumOrderQuantity: num(r.minimumOrderQuantity),
    leadTimeDays: num(r.leadTimeDays),
    isPreferred: Boolean(r.isPreferred),
    status: r.status as EntityStatus,
    notes: String(r.notes ?? ""),
    productName: String(r.productName ?? ""),
    variantName: String(r.variantName ?? ""),
    sku: String(r.sku),
    barcode: (r.barcode as string | null) ?? null,
    ...(warehouseId
      ? { quantityAvailable: num(r.quantityAvailable) }
      : {}),
  }));
}

export function getVendorProfileLocal(id: string): VendorProfileLocal | null {
  const vendor = getVendorLocal(id);
  if (!vendor) return null;
  return { vendor, skus: listVendorSkusLocal(id) };
}

export function getVendorSkuLocal(id: string): VendorSku | null {
  const db = getLocalDb();
  const row = db
    .prepare(
      `select
         vs.id,
         vs.vendor_id as vendorId,
         vs.product_sku_id as productSkuId,
         vs.vendor_sku_code as vendorSkuCode,
         vs.purchase_price as purchasePrice,
         vs.purchase_unit_id as purchaseUnitId,
         pu.name as purchaseUnitName,
         vs.units_per_purchase_unit as unitsPerPurchaseUnit,
         vs.minimum_order_quantity as minimumOrderQuantity,
         vs.lead_time_days as leadTimeDays,
         vs.is_preferred as isPreferred,
         vs.status,
         coalesce(vs.notes, '') as notes,
         p.name as productName,
         s.variant_name as variantName,
         s.sku,
         s.barcode
       from vendor_skus vs
       inner join product_skus s on s.id = vs.product_sku_id
       inner join products p on p.id = s.product_id
       left join units pu on pu.id = vs.purchase_unit_id
       where vs.id = ? and vs.tenant_id = ?`,
    )
    .get(id, DEMO_STORE_TENANT_ID) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    id: String(row.id),
    vendorId: String(row.vendorId),
    productSkuId: String(row.productSkuId),
    vendorSkuCode: (row.vendorSkuCode as string | null) ?? null,
    purchasePrice: num(row.purchasePrice),
    purchaseUnitId: (row.purchaseUnitId as string | null) ?? null,
    purchaseUnitName: (row.purchaseUnitName as string | null) ?? null,
    unitsPerPurchaseUnit: num(row.unitsPerPurchaseUnit, 1),
    minimumOrderQuantity: num(row.minimumOrderQuantity),
    leadTimeDays: num(row.leadTimeDays),
    isPreferred: Boolean(row.isPreferred),
    status: row.status as EntityStatus,
    notes: String(row.notes ?? ""),
    productName: String(row.productName ?? ""),
    variantName: String(row.variantName ?? ""),
    sku: String(row.sku),
    barcode: (row.barcode as string | null) ?? null,
  };
}

export function getSkuLocal(id: string): SkuDetail | null {
  const db = getLocalDb();
  const row = db
    .prepare(
      `select
         s.id,
         s.product_id as productId,
         p.name as productName,
         coalesce(p.product_code, '') as productCode,
         s.variant_name as variantName,
         s.sku,
         s.barcode,
         s.size_value as sizeValue,
         s.size_unit as sizeUnit,
         s.base_unit_id as baseUnitId,
         bu.name as baseUnitName,
         s.purchase_unit_id as purchaseUnitId,
         pu.name as purchaseUnitName,
         s.units_per_purchase_unit as unitsPerPurchaseUnit,
         s.cost_price as costPrice,
         s.selling_price as sellingPrice,
         s.selling_price_per_purchase_unit as sellingPricePerPurchaseUnit,
         s.reorder_level as reorderLevel,
         s.minimum_stock_level as minimumStockLevel,
         s.maximum_stock_level as maximumStockLevel,
         s.track_inventory as trackInventory,
         s.status
       from product_skus s
       inner join products p on p.id = s.product_id
       left join units bu on bu.id = s.base_unit_id
       left join units pu on pu.id = s.purchase_unit_id
       where s.id = ? and s.tenant_id = ?`,
    )
    .get(id, DEMO_STORE_TENANT_ID) as Record<string, unknown> | undefined;
  if (!row) return null;
  const barcodes = listSkuBarcodesLocal(id);
  return {
    id: String(row.id),
    productId: String(row.productId),
    productName: String(row.productName ?? ""),
    productCode: String(row.productCode ?? ""),
    variantName: String(row.variantName ?? ""),
    sku: String(row.sku),
    barcode: (row.barcode as string | null) ?? null,
    barcodes,
    sizeValue: (row.sizeValue as string | null) ?? null,
    sizeUnit: (row.sizeUnit as string | null) ?? null,
    baseUnitId: (row.baseUnitId as string | null) ?? null,
    baseUnitName: (row.baseUnitName as string | null) ?? null,
    purchaseUnitId: (row.purchaseUnitId as string | null) ?? null,
    purchaseUnitName: (row.purchaseUnitName as string | null) ?? null,
    unitsPerPurchaseUnit: num(row.unitsPerPurchaseUnit, 1),
    costPrice: num(row.costPrice),
    sellingPrice: num(row.sellingPrice),
    sellingPricePerPurchaseUnit: numOrNull(row.sellingPricePerPurchaseUnit),
    reorderLevel: num(row.reorderLevel),
    minimumStockLevel: num(row.minimumStockLevel),
    maximumStockLevel: numOrNull(row.maximumStockLevel),
    trackInventory: Boolean(row.trackInventory),
    status: row.status as EntityStatus,
  };
}

export function listSkuSuppliersLocal(skuId: string): SkuSupplier[] {
  const db = getLocalDb();
  const rows = db
    .prepare(
      `select
         vs.id as vendorSkuId,
         vs.vendor_id as vendorId,
         v.name as vendorName,
         v.vendor_code as vendorCode,
         vs.purchase_price as purchasePrice,
         vs.minimum_order_quantity as minimumOrderQuantity,
         vs.lead_time_days as leadTimeDays,
         vs.is_preferred as isPreferred,
         pu.name as purchaseUnitName
       from vendor_skus vs
       inner join vendors v on v.id = vs.vendor_id
       left join units pu on pu.id = vs.purchase_unit_id
       where vs.product_sku_id = ? and vs.tenant_id = ? and vs.status = 'active'
       order by v.name collate nocase`,
    )
    .all(skuId, DEMO_STORE_TENANT_ID) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    vendorSkuId: String(r.vendorSkuId),
    vendorId: String(r.vendorId),
    vendorName: String(r.vendorName),
    vendorCode: String(r.vendorCode),
    purchasePrice: num(r.purchasePrice),
    minimumOrderQuantity: num(r.minimumOrderQuantity),
    leadTimeDays: num(r.leadTimeDays),
    isPreferred: Boolean(r.isPreferred),
    purchaseUnitName: (r.purchaseUnitName as string | null) ?? null,
  }));
}

export function listSkuInventoryLocal(skuId: string): WarehouseStockRow[] {
  const db = getLocalDb();
  const rows = db
    .prepare(
      `select
         st.warehouse_id as warehouseId,
         w.name as warehouseName,
         st.product_sku_id as productSkuId,
         s.sku,
         s.variant_name as variantName,
         st.quantity_on_hand as quantityOnHand,
         st.quantity_reserved as quantityReserved,
         st.quantity_available as quantityAvailable
       from inventory_stock st
       inner join product_skus s on s.id = st.product_sku_id
       inner join warehouses w on w.id = st.warehouse_id
       where st.product_sku_id = ? and st.tenant_id = ?
       order by w.name collate nocase`,
    )
    .all(skuId, DEMO_STORE_TENANT_ID) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    warehouseId: String(r.warehouseId),
    warehouseName: String(r.warehouseName),
    productSkuId: String(r.productSkuId),
    sku: String(r.sku),
    variantName: String(r.variantName ?? ""),
    quantityOnHand: num(r.quantityOnHand),
    quantityReserved: num(r.quantityReserved),
    quantityAvailable: num(r.quantityAvailable),
  }));
}

export function getSkuProfileLocal(id: string): SkuProfileLocal | null {
  const sku = getSkuLocal(id);
  if (!sku) return null;
  return {
    sku,
    suppliers: listSkuSuppliersLocal(id),
    inventory: listSkuInventoryLocal(id),
  };
}

function mapSkuSearchRow(
  r: Record<string, unknown>,
  warehouseId?: string,
): SkuSearchResult {
  return {
    id: String(r.id),
    productId: String(r.productId),
    productName: String(r.productName ?? ""),
    variantName: String(r.variantName ?? ""),
    sku: String(r.sku),
    barcode: (r.barcode as string | null) ?? null,
    ...(warehouseId
      ? {
          quantityAvailable: num(r.quantityAvailable),
          costPrice: num(r.costPrice),
        }
      : {}),
  };
}

export function searchSkusLocal(
  q?: string,
  warehouseId?: string,
): SkuSearchResult[] {
  const db = getLocalDb();
  const query = q?.trim().toLowerCase() ?? "";
  const warehouse = warehouseId ?? "";
  const rows = db
    .prepare(
      `select
         s.id,
         s.product_id as productId,
         p.name as productName,
         s.variant_name as variantName,
         s.sku,
         s.barcode,
         s.cost_price as costPrice,
         coalesce(st.quantity_available, 0) as quantityAvailable
       from product_skus s
       inner join products p on p.id = s.product_id
       left join inventory_stock st
         on st.product_sku_id = s.id
        and st.warehouse_id = @warehouseId
        and st.tenant_id = s.tenant_id
        and @warehouseId != ''
       where s.tenant_id = @tenantId
         and s.status = 'active'
         and (
           @q = ''
           or lower(p.name) like '%' || @q || '%'
           or lower(s.variant_name) like '%' || @q || '%'
           or lower(s.sku) like '%' || @q || '%'
           or lower(coalesce(s.barcode, '')) like '%' || @q || '%'
           or exists (
             select 1 from product_sku_barcodes b
             where b.product_sku_id = s.id
               and b.tenant_id = s.tenant_id
               and b.status = 'active'
               and lower(b.barcode) like '%' || @q || '%'
           )
         )
       order by p.name collate nocase, s.variant_name collate nocase
       limit 50`,
    )
    .all({
      tenantId: DEMO_STORE_TENANT_ID,
      q: query,
      warehouseId: warehouse,
    }) as Array<Record<string, unknown>>;
  return rows.map((r) => mapSkuSearchRow(r, warehouse || undefined));
}

export function getSkuByBarcodeLocal(
  barcode: string,
  warehouseId: string,
): SkuSearchResult | null {
  const code = barcode.trim();
  if (!code || !warehouseId) return null;
  const match = findBarcodeMatchLocal(code, true);
  if (!match) return null;
  const db = getLocalDb();
  const row = db
    .prepare(
      `select
         s.id,
         s.product_id as productId,
         p.name as productName,
         s.variant_name as variantName,
         s.sku,
         s.barcode,
         s.units_per_purchase_unit as unitsPerPurchaseUnit,
         bu.name as baseUnitName,
         pu.name as purchaseUnitName,
         s.cost_price as costPrice,
         s.selling_price as sellingPrice,
         s.selling_price_per_purchase_unit as sellingPricePerPurchaseUnit,
         coalesce(st.quantity_available, 0) as quantityAvailable
       from product_skus s
       inner join products p on p.id = s.product_id
       left join units bu on bu.id = s.base_unit_id
       left join units pu on pu.id = s.purchase_unit_id
       left join inventory_stock st
         on st.product_sku_id = s.id
        and st.warehouse_id = ?
        and st.tenant_id = s.tenant_id
       where s.tenant_id = ?
         and s.status = 'active'
         and s.id = ?
       limit 1`,
    )
    .get(warehouseId, DEMO_STORE_TENANT_ID, match.skuId) as
    | Record<string, unknown>
    | undefined;
  if (!row) return null;
  return {
    ...mapSkuSearchRow(row, warehouseId),
    scannedQuantityMultiplier: match.quantityMultiplier,
    unitsPerPurchaseUnit: num(row.unitsPerPurchaseUnit, 1),
    baseUnitName: (row.baseUnitName as string | null) ?? null,
    purchaseUnitName: (row.purchaseUnitName as string | null) ?? null,
    sellingPrice: num(row.sellingPrice),
    sellingPricePerPurchaseUnit: numOrNull(row.sellingPricePerPurchaseUnit),
  };
}

function lookupProductSkuLocal(
  whereClause: string,
  param: string,
): SkuBarcodeLookupResult | null {
  const code = param.trim();
  if (!code) return null;
  const db = getLocalDb();
  const row = db
    .prepare(
      `select
         s.id,
         s.product_id as productId,
         p.name as productName,
         p.status as productStatus,
         s.variant_name as variantName,
         s.sku,
         s.barcode,
         s.size_value as sizeValue,
         s.size_unit as sizeUnit,
         s.base_unit_id as baseUnitId,
         bu.name as baseUnitName,
         s.purchase_unit_id as purchaseUnitId,
         pu.name as purchaseUnitName,
         s.units_per_purchase_unit as unitsPerPurchaseUnit,
         s.cost_price as costPrice,
         s.selling_price as sellingPrice,
         s.selling_price_per_purchase_unit as sellingPricePerPurchaseUnit,
         s.reorder_level as reorderLevel,
         s.minimum_stock_level as minimumStockLevel,
         s.maximum_stock_level as maximumStockLevel,
         s.track_inventory as trackInventory,
         s.status
       from product_skus s
       inner join products p on p.id = s.product_id
       left join units bu on bu.id = s.base_unit_id
       left join units pu on pu.id = s.purchase_unit_id
       where s.tenant_id = ?
         and ${whereClause}
       limit 1`,
    )
    .get(DEMO_STORE_TENANT_ID, code) as Record<string, unknown> | undefined;
  if (!row) return null;
  const detail = mapProductSkuRow(row);
  return {
    ...detail,
    productName: String(row.productName ?? ""),
    productStatus: row.productStatus as EntityStatus,
  };
}

export function lookupSkuByBarcodeLocal(
  barcode: string,
): SkuBarcodeLookupResult | null {
  const match = findBarcodeMatchLocal(barcode);
  if (!match) return null;
  const detail = lookupProductSkuLocal("s.id = ?", match.skuId);
  if (!detail) return null;
  return {
    ...detail,
    scannedQuantityMultiplier: match.quantityMultiplier,
  };
}

export function lookupSkuByCodeLocal(
  sku: string,
): SkuBarcodeLookupResult | null {
  return lookupProductSkuLocal("s.sku = ?", sku);
}

function eachInclusiveDate(dateFrom: string, dateTo: string): string[] {
  const days: string[] = [];
  const cur = new Date(`${dateFrom}T00:00:00.000Z`);
  const last = new Date(`${dateTo}T00:00:00.000Z`);
  if (Number.isNaN(cur.getTime()) || Number.isNaN(last.getTime()) || cur > last) {
    return days;
  }
  while (cur <= last) {
    days.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return days;
}

export function listInventoryInOutReportLocal(
  dateFrom: string,
  dateTo: string,
): InventoryInOutReport {
  const db = getLocalDb();
  const rows = db
    .prepare(
      `select
         m.id,
         m.product_sku_id as productSkuId,
         s.sku,
         s.variant_name as variantName,
         p.id as productId,
         p.name as productName,
         m.warehouse_id as warehouseId,
         w.name as warehouseName,
         m.movement_type as movementType,
         m.quantity,
         m.reference_type as referenceType,
         m.reference_id as referenceId,
         gr.vendor_id as vendorId,
         v.name as vendorName,
         coalesce(m.reason, '') as reason,
         m.created_at as createdAt
       from inventory_movements m
       inner join product_skus s on s.id = m.product_sku_id
       inner join products p on p.id = s.product_id
       inner join warehouses w on w.id = m.warehouse_id
       left join goods_receipts gr
         on m.reference_type = 'goods_receipt' and m.reference_id = gr.id
       left join vendors v on v.id = gr.vendor_id
       where m.tenant_id = ?
         and m.movement_type in ('PURCHASE_RECEIPT', 'INVENTORY_OUT')
         and date(m.created_at) >= ?
         and date(m.created_at) <= ?
       order by m.created_at desc`,
    )
    .all(DEMO_STORE_TENANT_ID, dateFrom, dateTo) as Array<Record<string, unknown>>;

  const inboundItems: InventoryMovementListItem[] = [];
  const outboundItems: InventoryMovementListItem[] = [];
  const qtyByDay = new Map<string, { inboundQty: number; outboundQty: number }>();

  for (const r of rows) {
    const item: InventoryMovementListItem = {
      id: String(r.id),
      productSkuId: String(r.productSkuId),
      sku: String(r.sku),
      variantName: String(r.variantName ?? ""),
      productId: r.productId != null ? String(r.productId) : undefined,
      productName: r.productName != null ? String(r.productName) : undefined,
      warehouseId: String(r.warehouseId),
      warehouseName: String(r.warehouseName ?? ""),
      movementType: r.movementType as InventoryMovementType,
      quantity: num(r.quantity),
      referenceType: (r.referenceType as string | null) ?? null,
      referenceId: (r.referenceId as string | null) ?? null,
      vendorId: r.vendorId != null ? String(r.vendorId) : null,
      vendorName: r.vendorName != null ? String(r.vendorName) : null,
      reason: String(r.reason ?? ""),
      createdAt: String(r.createdAt),
    };
    const day = String(r.createdAt).slice(0, 10);
    const bucket = qtyByDay.get(day) ?? { inboundQty: 0, outboundQty: 0 };
    if (item.movementType === "PURCHASE_RECEIPT") {
      inboundItems.push(item);
      bucket.inboundQty += item.quantity;
    } else if (item.movementType === "INVENTORY_OUT") {
      outboundItems.push(item);
      bucket.outboundQty += item.quantity;
    }
    qtyByDay.set(day, bucket);
  }

  return {
    dateFrom,
    dateTo,
    inbound: {
      items: inboundItems,
      quantityTotal: inboundItems.reduce((sum, i) => sum + i.quantity, 0),
      lineCount: inboundItems.length,
    },
    outbound: {
      items: outboundItems,
      quantityTotal: outboundItems.reduce((sum, i) => sum + i.quantity, 0),
      lineCount: outboundItems.length,
    },
    byDay: eachInclusiveDate(dateFrom, dateTo).map((date) => {
      const bucket = qtyByDay.get(date);
      return {
        date,
        inboundQty: bucket?.inboundQty ?? 0,
        outboundQty: bucket?.outboundQty ?? 0,
      };
    }),
  };
}

export function getPurchaseOrderLocal(id: string): PurchaseOrderDetail | null {
  const db = getLocalDb();
  const row = db
    .prepare(
      `select
         po.id,
         po.po_number as poNumber,
         po.vendor_id as vendorId,
         coalesce(v.name, '') as vendorName,
         po.warehouse_id as warehouseId,
         coalesce(w.name, '') as warehouseName,
         po.status,
         po.order_date as orderDate,
         po.expected_date as expectedDate,
         po.subtotal,
         po.discount,
         po.tax,
         po.other_charges as otherCharges,
         po.total,
         coalesce(po.notes, '') as notes,
         po.created_at as createdAt,
         po.updated_at as updatedAt
       from purchase_orders po
       left join vendors v on v.id = po.vendor_id
       left join warehouses w on w.id = po.warehouse_id
       where po.id = ? and po.tenant_id = ?`,
    )
    .get(id, DEMO_STORE_TENANT_ID) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    id: String(row.id),
    poNumber: String(row.poNumber),
    vendorId: String(row.vendorId),
    vendorName: String(row.vendorName ?? ""),
    warehouseId: String(row.warehouseId),
    warehouseName: String(row.warehouseName ?? ""),
    status: row.status as PurchaseOrderStatus,
    orderDate: String(row.orderDate),
    expectedDate: (row.expectedDate as string | null) ?? null,
    subtotal: num(row.subtotal),
    discount: num(row.discount),
    tax: num(row.tax),
    otherCharges: num(row.otherCharges),
    total: num(row.total),
    notes: String(row.notes ?? ""),
    items: listPurchaseOrderItemsLocal(id),
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  };
}

function listPurchaseOrderItemsLocal(purchaseOrderId: string): PurchaseOrderItemRow[] {
  const db = getLocalDb();
  const rows = db
    .prepare(
      `select
         i.id,
         i.product_sku_id as productSkuId,
         i.vendor_sku_id as vendorSkuId,
         coalesce(p.name, '') as productName,
         coalesce(s.variant_name, '') as variantName,
         coalesce(s.sku, '') as sku,
         vs.vendor_sku_code as vendorSkuCode,
         i.purchase_unit_id as purchaseUnitId,
         pu.name as purchaseUnitName,
         i.units_per_purchase_unit as unitsPerPurchaseUnit,
         i.quantity,
         i.unit_cost as unitCost,
         i.discount,
         i.tax,
         i.line_total as lineTotal,
         coalesce(vs.minimum_order_quantity, 0) as minimumOrderQuantity
       from purchase_order_items i
       left join product_skus s on s.id = i.product_sku_id
       left join products p on p.id = s.product_id
       left join units pu on pu.id = i.purchase_unit_id
       left join vendor_skus vs on vs.id = i.vendor_sku_id
       where i.purchase_order_id = ? and i.tenant_id = ?
       order by i.created_at, i.id`,
    )
    .all(purchaseOrderId, DEMO_STORE_TENANT_ID) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: String(r.id),
    productSkuId: String(r.productSkuId),
    vendorSkuId: String(r.vendorSkuId ?? ""),
    productName: String(r.productName ?? ""),
    variantName: String(r.variantName ?? ""),
    sku: String(r.sku ?? ""),
    vendorSkuCode: (r.vendorSkuCode as string | null) ?? null,
    purchaseUnitId: (r.purchaseUnitId as string | null) ?? null,
    purchaseUnitName: (r.purchaseUnitName as string | null) ?? null,
    unitsPerPurchaseUnit: num(r.unitsPerPurchaseUnit, 1),
    quantity: num(r.quantity),
    unitCost: num(r.unitCost),
    discount: num(r.discount),
    tax: num(r.tax),
    lineTotal: num(r.lineTotal),
    minimumOrderQuantity: num(r.minimumOrderQuantity),
  }));
}

export function getReceivingDraftLocal(poId: string): ReceivingDraft | null {
  const po = getPurchaseOrderLocal(poId);
  if (!po) return null;
  const db = getLocalDb();
  const priceRows = db
    .prepare(
      `select
         i.id as purchaseOrderItemId,
         vs.purchase_price as currentVendorPurchasePrice,
         s.selling_price as currentSellingPrice
       from purchase_order_items i
       left join product_skus s on s.id = i.product_sku_id
       left join vendor_skus vs on vs.id = i.vendor_sku_id
       where i.purchase_order_id = ? and i.tenant_id = ?`,
    )
    .all(poId, DEMO_STORE_TENANT_ID) as Array<Record<string, unknown>>;
  const prices = new Map(
    priceRows.map((r) => [
      String(r.purchaseOrderItemId),
      {
        currentVendorPurchasePrice: numOrNull(r.currentVendorPurchasePrice),
        currentSellingPrice: num(r.currentSellingPrice),
      },
    ]),
  );
  const items: ReceivingLineDraft[] = po.items.map((item) => {
    const extra = prices.get(item.id);
    return {
      purchaseOrderItemId: item.id,
      productSkuId: item.productSkuId,
      vendorSkuId: item.vendorSkuId || null,
      productName: item.productName,
      variantName: item.variantName,
      sku: item.sku,
      vendorSkuCode: item.vendorSkuCode,
      purchaseUnitId: item.purchaseUnitId,
      purchaseUnitName: item.purchaseUnitName,
      unitsPerPurchaseUnit: item.unitsPerPurchaseUnit,
      orderedQuantity: item.quantity,
      poUnitCost: item.unitCost,
      currentVendorPurchasePrice: extra?.currentVendorPurchasePrice ?? null,
      currentSellingPrice: extra?.currentSellingPrice ?? 0,
    };
  });
  return {
    purchaseOrderId: po.id,
    poNumber: po.poNumber,
    vendorId: po.vendorId,
    vendorName: po.vendorName,
    warehouseId: po.warehouseId,
    warehouseName: po.warehouseName,
    status: po.status,
    items,
  };
}

export function getGoodsReceiptLocal(id: string): GoodsReceiptDetail | null {
  const db = getLocalDb();
  const row = db
    .prepare(
      `select
         gr.id,
         gr.receipt_number as receiptNumber,
         gr.purchase_order_id as purchaseOrderId,
         coalesce(po.po_number, '') as poNumber,
         gr.vendor_id as vendorId,
         coalesce(v.name, '') as vendorName,
         gr.warehouse_id as warehouseId,
         coalesce(w.name, '') as warehouseName,
         gr.status,
         gr.received_at as receivedAt,
         gr.voucher_number as voucherNumber,
         gr.subtotal,
         gr.discount,
         gr.tax,
         coalesce(gr.adv_tax, 0) as advTax,
         coalesce(gr.gst, 0) as gst,
         coalesce(gr.incentive, 0) as incentive,
         coalesce(gr.shelf_rent, 0) as shelfRent,
         gr.other_charges as otherCharges,
         coalesce(gr.return_credit, 0) as returnCredit,
         gr.total,
         coalesce(gr.notes, '') as notes,
         gr.created_at as createdAt,
         gr.updated_at as updatedAt
       from goods_receipts gr
       left join purchase_orders po on po.id = gr.purchase_order_id
       left join vendors v on v.id = gr.vendor_id
       left join warehouses w on w.id = gr.warehouse_id
       where gr.id = ? and gr.tenant_id = ?`,
    )
    .get(id, DEMO_STORE_TENANT_ID) as Record<string, unknown> | undefined;
  if (!row) return null;

  const items = db
    .prepare(
      `select
         i.id,
         i.purchase_order_item_id as purchaseOrderItemId,
         i.product_sku_id as productSkuId,
         i.vendor_sku_id as vendorSkuId,
         coalesce(p.name, '') as productName,
         coalesce(s.variant_name, '') as variantName,
         coalesce(s.sku, '') as sku,
         vs.vendor_sku_code as vendorSkuCode,
         i.purchase_unit_id as purchaseUnitId,
         pu.name as purchaseUnitName,
         i.units_per_purchase_unit as unitsPerPurchaseUnit,
         i.ordered_quantity as orderedQuantity,
         i.received_quantity as receivedQuantity,
         i.bonus_quantity as bonusQuantity,
         i.po_unit_cost as poUnitCost,
         i.receiving_unit_cost as receivingUnitCost,
         i.discount_percent as discountPercent,
         i.line_total as lineTotal
       from goods_receipt_items i
       left join product_skus s on s.id = i.product_sku_id
       left join products p on p.id = s.product_id
       left join units pu on pu.id = i.purchase_unit_id
       left join vendor_skus vs on vs.id = i.vendor_sku_id
       where i.goods_receipt_id = ? and i.tenant_id = ?
       order by i.created_at, i.id`,
    )
    .all(id, DEMO_STORE_TENANT_ID) as Array<Record<string, unknown>>;

  return {
    id: String(row.id),
    receiptNumber: String(row.receiptNumber),
    purchaseOrderId: String(row.purchaseOrderId),
    poNumber: String(row.poNumber ?? ""),
    vendorId: (row.vendorId as string | null) ?? null,
    vendorName: (row.vendorName as string | null) || null,
    warehouseId: String(row.warehouseId),
    warehouseName: String(row.warehouseName ?? ""),
    status: row.status as GoodsReceiptStatus,
    receivedAt: (row.receivedAt as string | null) ?? null,
    voucherNumber: (row.voucherNumber as string | null) ?? null,
    subtotal: num(row.subtotal),
    discount: num(row.discount),
    saleTax: num(row.tax),
    advTax: num(row.advTax),
    gst: num(row.gst),
    incentive: num(row.incentive),
    shelfRent: num(row.shelfRent),
    tax: num(row.tax),
    otherCharges: num(row.otherCharges),
    returnCredit: num(row.returnCredit),
    total: num(row.total),
    notes: String(row.notes ?? ""),
    items: items.map((r) => ({
      id: String(r.id),
      purchaseOrderItemId: (r.purchaseOrderItemId as string | null) ?? null,
      productSkuId: String(r.productSkuId),
      vendorSkuId: (r.vendorSkuId as string | null) ?? null,
      productName: String(r.productName ?? ""),
      variantName: String(r.variantName ?? ""),
      sku: String(r.sku ?? ""),
      vendorSkuCode: (r.vendorSkuCode as string | null) ?? null,
      purchaseUnitId: (r.purchaseUnitId as string | null) ?? null,
      purchaseUnitName: (r.purchaseUnitName as string | null) ?? null,
      unitsPerPurchaseUnit: num(r.unitsPerPurchaseUnit, 1),
      orderedQuantity: num(r.orderedQuantity),
      receivedQuantity: num(r.receivedQuantity),
      bonusQuantity: num(r.bonusQuantity),
      poUnitCost: num(r.poUnitCost),
      receivingUnitCost: num(r.receivingUnitCost),
      discountPercent: num(r.discountPercent),
      lineTotal: num(r.lineTotal),
    })),
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  };
}

export function getInventoryOutLocal(id: string): InventoryOutDetail | null {
  const db = getLocalDb();
  const row = db
    .prepare(
      `select
         o.id,
         o.out_number as outNumber,
         o.warehouse_id as warehouseId,
         coalesce(w.name, '') as warehouseName,
         o.out_date as outDate,
         o.reference,
         coalesce(o.notes, '') as notes,
         o.status,
         o.subtotal,
         o.total,
         o.created_at as createdAt,
         o.updated_at as updatedAt
       from inventory_outs o
       left join warehouses w on w.id = o.warehouse_id
       where o.id = ? and o.tenant_id = ?`,
    )
    .get(id, DEMO_STORE_TENANT_ID) as Record<string, unknown> | undefined;
  if (!row) return null;

  const items = db
    .prepare(
      `select
         i.id,
         i.product_sku_id as productSkuId,
         coalesce(p.name, '') as productName,
         coalesce(s.variant_name, '') as variantName,
         coalesce(s.sku, '') as sku,
         s.barcode,
         i.quantity,
         i.unit_cost as unitCost
       from inventory_out_items i
       left join product_skus s on s.id = i.product_sku_id
       left join products p on p.id = s.product_id
       where i.inventory_out_id = ? and i.tenant_id = ?
       order by i.created_at, i.id`,
    )
    .all(id, DEMO_STORE_TENANT_ID) as Array<Record<string, unknown>>;

  return {
    id: String(row.id),
    outNumber: String(row.outNumber),
    warehouseId: String(row.warehouseId),
    warehouseName: String(row.warehouseName ?? ""),
    outDate: String(row.outDate),
    reference: (row.reference as string | null) ?? null,
    notes: String(row.notes ?? ""),
    status: row.status as InventoryOutStatus,
    subtotal: num(row.subtotal),
    total: num(row.total),
    items: items.map((r) => {
      const quantity = num(r.quantity);
      const unitCost = num(r.unitCost);
      return {
        id: String(r.id),
        productSkuId: String(r.productSkuId),
        productName: String(r.productName ?? ""),
        variantName: String(r.variantName ?? ""),
        sku: String(r.sku ?? ""),
        barcode: (r.barcode as string | null) ?? null,
        quantity,
        unitCost,
        lineTotal: Math.round(quantity * unitCost * 10000) / 10000,
      };
    }),
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  };
}

export function getVendorReturnLocal(id: string): VendorReturnDetail | null {
  const db = getLocalDb();
  const row = db
    .prepare(
      `select
         vr.id,
         vr.return_number as returnNumber,
         vr.vendor_id as vendorId,
         coalesce(v.name, '') as vendorName,
         vr.warehouse_id as warehouseId,
         coalesce(w.name, '') as warehouseName,
         vr.return_date as returnDate,
         coalesce(vr.notes, '') as notes,
         vr.status,
         vr.subtotal,
         vr.total,
         vr.created_at as createdAt,
         vr.updated_at as updatedAt
       from vendor_returns vr
       left join vendors v on v.id = vr.vendor_id
       left join warehouses w on w.id = vr.warehouse_id
       where vr.id = ? and vr.tenant_id = ?`,
    )
    .get(id, DEMO_STORE_TENANT_ID) as Record<string, unknown> | undefined;
  if (!row) return null;

  const items = db
    .prepare(
      `select
         i.id,
         i.product_sku_id as productSkuId,
         i.vendor_sku_id as vendorSkuId,
         coalesce(p.name, '') as productName,
         coalesce(s.variant_name, '') as variantName,
         coalesce(s.sku, '') as sku,
         s.barcode,
         i.purchase_unit_id as purchaseUnitId,
         pu.name as purchaseUnitName,
         i.units_per_purchase_unit as unitsPerPurchaseUnit,
         i.quantity,
         i.unit_cost as unitCost,
         i.reason,
         i.settlement,
         i.goods_receipt_id as goodsReceiptId
       from vendor_return_items i
       left join product_skus s on s.id = i.product_sku_id
       left join products p on p.id = s.product_id
       left join units pu on pu.id = i.purchase_unit_id
       where i.vendor_return_id = ? and i.tenant_id = ?
       order by i.created_at, i.id`,
    )
    .all(id, DEMO_STORE_TENANT_ID) as Array<Record<string, unknown>>;

  return {
    id: String(row.id),
    returnNumber: String(row.returnNumber),
    vendorId: String(row.vendorId),
    vendorName: String(row.vendorName ?? ""),
    warehouseId: String(row.warehouseId),
    warehouseName: String(row.warehouseName ?? ""),
    returnDate: String(row.returnDate),
    notes: String(row.notes ?? ""),
    status: row.status as VendorReturnStatus,
    subtotal: num(row.subtotal),
    total: num(row.total),
    items: items.map((r) => {
      const quantity = num(r.quantity);
      const unitCost = num(r.unitCost);
      const unitsPer = num(r.unitsPerPurchaseUnit, 1) || 1;
      return {
        id: String(r.id),
        productSkuId: String(r.productSkuId),
        vendorSkuId: (r.vendorSkuId as string | null) ?? null,
        productName: String(r.productName ?? ""),
        variantName: String(r.variantName ?? ""),
        sku: String(r.sku ?? ""),
        barcode: (r.barcode as string | null) ?? null,
        purchaseUnitId: (r.purchaseUnitId as string | null) ?? null,
        purchaseUnitName: (r.purchaseUnitName as string | null) ?? null,
        unitsPerPurchaseUnit: unitsPer,
        quantity,
        unitCost,
        lineTotal:
          Math.round((quantity / unitsPer) * unitCost * 10000) / 10000,
        reason: r.reason as VendorReturnReason,
        settlement: (r.settlement as VendorReturnSettlement | null) ?? null,
        goodsReceiptId: (r.goodsReceiptId as string | null) ?? null,
      };
    }),
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  };
}
