import type {
  Brand,
  Category,
  DashboardSummary,
  EntityStatus,
  PaginatedProducts,
  PaginatedPurchaseOrders,
  PaginatedVendors,
  GoodsReceiptListItem,
  GoodsReceiptListQuery,
  GoodsReceiptStatus,
  PaginatedGoodsReceipts,
  ProductListItem,
  ProductListQuery,
  ProductType,
  PurchaseOrderListItem,
  PurchaseOrderListQuery,
  PurchaseOrderStatus,
  VendorGroup,
  VendorListItem,
  UnitListItem,
  VendorListQuery,
  VendorReturnListItem,
  VendorReturnListQuery,
  VendorReturnStatus,
  PaginatedVendorReturns,
  WarehouseListItem,
} from "@blackbox/shared";
import { DEMO_STORE_TENANT_ID } from "@blackbox/shared";
import { getLocalDb } from "./index";

function pageParams(page?: number, pageSize?: number) {
  const p = page ?? 1;
  const ps = Math.min(pageSize ?? 25, 100);
  return { page: p, pageSize: ps, offset: (p - 1) * ps };
}

export function listBrandsLocal(status?: EntityStatus | "all"): Brand[] {
  const db = getLocalDb();
  const rows = db
    .prepare(
      `select id, name, description, status
       from brands
       where tenant_id = ?
         and (? = 'all' or status = ?)
       order by name collate nocase`,
    )
    .all(
      DEMO_STORE_TENANT_ID,
      status ?? "active",
      status === "all" ? "" : (status ?? "active"),
    ) as Brand[];
  return rows;
}

export function getBrandLocal(id: string): Brand | null {
  const db = getLocalDb();
  return (
    (db
      .prepare(
        `select id, name, description, status
         from brands where id = ? and tenant_id = ?`,
      )
      .get(id, DEMO_STORE_TENANT_ID) as Brand | undefined) ?? null
  );
}

export function listCategoriesLocal(
  status?: EntityStatus | "all",
): Category[] {
  const db = getLocalDb();
  return db
    .prepare(
      `select id, name, description, status
       from categories
       where tenant_id = ?
         and (? = 'all' or status = ?)
       order by name collate nocase`,
    )
    .all(
      DEMO_STORE_TENANT_ID,
      status ?? "active",
      status === "all" ? "" : (status ?? "active"),
    ) as Category[];
}

export function getCategoryLocal(id: string): Category | null {
  const db = getLocalDb();
  return (
    (db
      .prepare(
        `select id, name, description, status
         from categories where id = ? and tenant_id = ?`,
      )
      .get(id, DEMO_STORE_TENANT_ID) as Category | undefined) ?? null
  );
}

export function listVendorGroupsLocal(
  status?: EntityStatus | "all",
): VendorGroup[] {
  const db = getLocalDb();
  return db
    .prepare(
      `select id, name, description, status
       from vendor_groups
       where tenant_id = ?
         and (? = 'all' or status = ?)
       order by name collate nocase`,
    )
    .all(
      DEMO_STORE_TENANT_ID,
      status ?? "active",
      status === "all" ? "" : (status ?? "active"),
    ) as VendorGroup[];
}

export function getVendorGroupLocal(id: string): VendorGroup | null {
  const db = getLocalDb();
  return (
    (db
      .prepare(
        `select id, name, description, status
         from vendor_groups where id = ? and tenant_id = ?`,
      )
      .get(id, DEMO_STORE_TENANT_ID) as VendorGroup | undefined) ?? null
  );
}

export function listWarehousesLocal(
  status?: EntityStatus | "all",
): WarehouseListItem[] {
  const db = getLocalDb();
  return db
    .prepare(
      `select id, name, code, location, status
       from warehouses
       where tenant_id = ?
         and (? = 'all' or status = ?)
       order by name collate nocase`,
    )
    .all(
      DEMO_STORE_TENANT_ID,
      status ?? "all",
      status === "all" || status === undefined ? "" : status,
    ) as WarehouseListItem[];
}

export function getWarehouseLocal(id: string): WarehouseListItem | null {
  const db = getLocalDb();
  return (
    (db
      .prepare(
        `select id, name, code, location, status
         from warehouses
         where id = ? and tenant_id = ?`,
      )
      .get(id, DEMO_STORE_TENANT_ID) as WarehouseListItem | undefined) ?? null
  );
}

export function listUnitsLocal(): UnitListItem[] {
  const db = getLocalDb();
  return db
    .prepare(
      `select id, name, abbreviation, type, status
       from units
       where tenant_id = ?
         and status = 'active'
       order by name collate nocase`,
    )
    .all(DEMO_STORE_TENANT_ID) as UnitListItem[];
}

export function listProductsLocal(
  query: ProductListQuery = {},
): PaginatedProducts {
  const db = getLocalDb();
  const { page, pageSize, offset } = pageParams(query.page, query.pageSize);
  const search = query.search?.trim().toLowerCase() ?? "";
  const status = query.status ?? "";
  const brandId = query.brandId ?? "";
  const categoryId = query.categoryId ?? "";

  const where = `
    p.tenant_id = @tenantId
    and (@status = '' or p.status = @status)
    and (@brandId = '' or p.brand_id = @brandId)
    and (@categoryId = '' or p.category_id = @categoryId)
    and (
      @search = ''
      or lower(p.name) like '%' || @search || '%'
      or lower(coalesce(p.product_code, '')) like '%' || @search || '%'
      or exists (
        select 1 from product_skus s
        where s.product_id = p.id and s.tenant_id = p.tenant_id
          and (
            lower(s.sku) like '%' || @search || '%'
            or lower(coalesce(s.barcode, '')) like '%' || @search || '%'
            or lower(s.variant_name) like '%' || @search || '%'
          )
      )
      or exists (
        select 1 from brands b
        where b.id = p.brand_id and lower(b.name) like '%' || @search || '%'
      )
      or exists (
        select 1 from categories c
        where c.id = p.category_id and lower(c.name) like '%' || @search || '%'
      )
    )
  `;

  const params = {
    tenantId: DEMO_STORE_TENANT_ID,
    status,
    brandId,
    categoryId,
    search,
    limit: pageSize,
    offset,
  };

  const total = (
    db
      .prepare(`select count(*) as cnt from products p where ${where}`)
      .get(params) as { cnt: number }
  ).cnt;

  const rows = db
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
         p.status,
         (
           select count(*) from product_skus s
           where s.product_id = p.id and s.tenant_id = p.tenant_id
         ) as skuCount,
         coalesce((
           select sum(st.quantity_available)
           from inventory_stock st
           inner join product_skus s on s.id = st.product_sku_id
           where s.product_id = p.id and st.tenant_id = p.tenant_id
         ), 0) as totalAvailable,
         coalesce((
           select count(distinct vs.vendor_id)
           from vendor_skus vs
           inner join product_skus s on s.id = vs.product_sku_id
           where s.product_id = p.id and vs.tenant_id = p.tenant_id
             and vs.status = 'active'
         ), 0) as supplierCount
       from products p
       left join brands b on b.id = p.brand_id
       left join categories c on c.id = p.category_id
       where ${where}
       order by p.name collate nocase
       limit @limit offset @offset`,
    )
    .all(params) as Array<{
    id: string;
    name: string;
    productCode: string;
    brandId: string | null;
    brandName: string | null;
    categoryId: string | null;
    categoryName: string | null;
    productType: string;
    status: string;
    skuCount: number;
    totalAvailable: number;
    supplierCount: number;
  }>;

  const items: ProductListItem[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    productCode: r.productCode,
    brandId: r.brandId,
    brandName: r.brandName,
    categoryId: r.categoryId,
    categoryName: r.categoryName,
    productType: r.productType as ProductType,
    status: r.status as EntityStatus,
    skuCount: Number(r.skuCount) || 0,
    totalAvailable: Number(r.totalAvailable) || 0,
    supplierCount: Number(r.supplierCount) || 0,
  }));

  return { items, total, page, pageSize };
}

export function listVendorsLocal(
  query: VendorListQuery = {},
): PaginatedVendors {
  const db = getLocalDb();
  const { page, pageSize, offset } = pageParams(query.page, query.pageSize);
  const search = query.search?.trim().toLowerCase() ?? "";
  const status = query.status ?? "active";
  const statusBind = status === "all" ? "" : status;
  const groupId = query.groupId ?? "";

  const where = `
    v.tenant_id = @tenantId
    and (@status = 'all' or v.status = @statusBind)
    and (@groupId = '' or v.group_id = @groupId)
    and (
      @search = ''
      or lower(v.name) like '%' || @search || '%'
      or lower(v.vendor_code) like '%' || @search || '%'
      or lower(coalesce(v.city, '')) like '%' || @search || '%'
    )
  `;

  const params = {
    tenantId: DEMO_STORE_TENANT_ID,
    status,
    statusBind,
    groupId,
    search,
    limit: pageSize,
    offset,
  };

  const total = (
    db
      .prepare(`select count(*) as cnt from vendors v where ${where}`)
      .get(params) as { cnt: number }
  ).cnt;

  const rows = db
    .prepare(
      `select
         v.id,
         v.name,
         v.vendor_code as vendorCode,
         v.group_id as groupId,
         g.name as groupName,
         v.status,
         v.city,
         (
           select c.name from vendor_contacts c
           where c.vendor_id = v.id and c.contact_type = 'PRIMARY'
           limit 1
         ) as primaryContactName,
         (
           select c.phone from vendor_contacts c
           where c.vendor_id = v.id and c.contact_type = 'PRIMARY'
           limit 1
         ) as primaryContactPhone,
         (
           select count(*) from vendor_skus vs
           where vs.vendor_id = v.id and vs.tenant_id = v.tenant_id
             and vs.status = 'active'
         ) as suppliedSkuCount
       from vendors v
       left join vendor_groups g on g.id = v.group_id
       where ${where}
       order by v.name collate nocase
       limit @limit offset @offset`,
    )
    .all(params) as Array<{
    id: string;
    name: string;
    vendorCode: string;
    groupId: string | null;
    groupName: string | null;
    status: string;
    city: string | null;
    primaryContactName: string | null;
    primaryContactPhone: string | null;
    suppliedSkuCount: number;
  }>;

  const items: VendorListItem[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    vendorCode: r.vendorCode,
    groupId: r.groupId,
    groupName: r.groupName,
    status: r.status as EntityStatus,
    city: r.city,
    primaryContactName: r.primaryContactName,
    primaryContactPhone: r.primaryContactPhone,
    suppliedSkuCount: Number(r.suppliedSkuCount) || 0,
  }));

  return { items, total, page, pageSize };
}

export function listPurchaseOrdersLocal(
  query: PurchaseOrderListQuery = {},
): PaginatedPurchaseOrders {
  const db = getLocalDb();
  const { page, pageSize, offset } = pageParams(query.page, query.pageSize);
  const search = query.search?.trim().toLowerCase() ?? "";
  const status = query.status ?? "";
  const vendorId = query.vendorId ?? "";
  const warehouseId = query.warehouseId ?? "";
  const dateFrom = query.dateFrom ?? "";
  const dateTo = query.dateTo ?? "";

  const where = `
    po.tenant_id = @tenantId
    and (@status = '' or po.status = @status)
    and (@vendorId = '' or po.vendor_id = @vendorId)
    and (@warehouseId = '' or po.warehouse_id = @warehouseId)
    and (@dateFrom = '' or po.order_date >= @dateFrom)
    and (@dateTo = '' or po.order_date <= @dateTo)
    and (
      @search = ''
      or lower(po.po_number) like '%' || @search || '%'
      or exists (
        select 1 from vendors v
        where v.id = po.vendor_id and lower(v.name) like '%' || @search || '%'
      )
    )
  `;

  const params = {
    tenantId: DEMO_STORE_TENANT_ID,
    status,
    vendorId,
    warehouseId,
    dateFrom,
    dateTo,
    search,
    limit: pageSize,
    offset,
  };

  const total = (
    db
      .prepare(`select count(*) as cnt from purchase_orders po where ${where}`)
      .get(params) as { cnt: number }
  ).cnt;

  const rows = db
    .prepare(
      `select
         po.id,
         po.po_number as poNumber,
         po.vendor_id as vendorId,
         coalesce(v.name, '—') as vendorName,
         po.warehouse_id as warehouseId,
         coalesce(w.name, '—') as warehouseName,
         po.status,
         po.order_date as orderDate,
         po.expected_date as expectedDate,
         po.total,
         (
           select count(*) from purchase_order_items i
           where i.purchase_order_id = po.id and i.tenant_id = po.tenant_id
         ) as itemCount
       from purchase_orders po
       left join vendors v on v.id = po.vendor_id
       left join warehouses w on w.id = po.warehouse_id
       where ${where}
       order by po.order_date desc, po.created_at desc
       limit @limit offset @offset`,
    )
    .all(params) as Array<{
    id: string;
    poNumber: string;
    vendorId: string;
    vendorName: string;
    warehouseId: string;
    warehouseName: string;
    status: string;
    orderDate: string;
    expectedDate: string | null;
    total: number;
    itemCount: number;
  }>;

  const items: PurchaseOrderListItem[] = rows.map((r) => ({
    id: r.id,
    poNumber: r.poNumber,
    vendorId: r.vendorId,
    vendorName: r.vendorName,
    warehouseId: r.warehouseId,
    warehouseName: r.warehouseName,
    status: r.status as PurchaseOrderStatus,
    orderDate: r.orderDate,
    expectedDate: r.expectedDate,
    total: Number(r.total) || 0,
    itemCount: Number(r.itemCount) || 0,
  }));

  return { items, total, page, pageSize };
}

export function getDashboardSummaryLocal(): DashboardSummary {
  const db = getLocalDb();
  const tenantId = DEMO_STORE_TENANT_ID;

  const totalProducts = (
    db
      .prepare("select count(*) as cnt from products where tenant_id = ?")
      .get(tenantId) as { cnt: number }
  ).cnt;
  const totalSkus = (
    db
      .prepare("select count(*) as cnt from product_skus where tenant_id = ?")
      .get(tenantId) as { cnt: number }
  ).cnt;
  const totalStockLines = (
    db
      .prepare("select count(*) as cnt from inventory_stock where tenant_id = ?")
      .get(tenantId) as { cnt: number }
  ).cnt;
  const lowStockItems = (
    db
      .prepare(
        `select count(*) as cnt
         from inventory_stock s
         inner join product_skus sku on sku.id = s.product_sku_id
         where s.tenant_id = ?
           and s.quantity_available <= sku.reorder_level`,
      )
      .get(tenantId) as { cnt: number }
  ).cnt;
  const pendingPurchaseOrders = (
    db
      .prepare(
        `select count(*) as cnt
         from purchase_orders
         where tenant_id = ?
           and status in ('DRAFT', 'SUBMITTED', 'PARTIALLY_RECEIVED')`,
      )
      .get(tenantId) as { cnt: number }
  ).cnt;
  const recentReceipts = (
    db
      .prepare(
        `select count(*) as cnt
         from goods_receipts
         where tenant_id = ?
           and status = 'POSTED'
           and received_at is not null
           and datetime(received_at) >= datetime('now', '-30 days')`,
      )
      .get(tenantId) as { cnt: number }
  ).cnt;

  return {
    totalProducts,
    totalSkus,
    totalStockLines,
    lowStockItems,
    pendingPurchaseOrders,
    recentReceipts,
  };
}

export function listGoodsReceiptsLocal(
  query: GoodsReceiptListQuery = {},
): PaginatedGoodsReceipts {
  const db = getLocalDb();
  const { page, pageSize, offset } = pageParams(query.page, query.pageSize);
  const search = query.search?.trim().toLowerCase() ?? "";
  const status = query.status ?? "";
  const vendorId = query.vendorId ?? "";
  const warehouseId = query.warehouseId ?? "";
  const dateFrom = query.dateFrom ?? "";
  const dateTo = query.dateTo ?? "";

  const where = `
    gr.tenant_id = @tenantId
    and (@status = '' or gr.status = @status)
    and (@vendorId = '' or gr.vendor_id = @vendorId)
    and (@warehouseId = '' or gr.warehouse_id = @warehouseId)
    and (@dateFrom = '' or gr.received_at >= @dateFrom)
    and (@dateTo = '' or gr.received_at <= @dateTo)
    and (
      @search = ''
      or lower(gr.receipt_number) like '%' || @search || '%'
      or lower(coalesce(po.po_number, '')) like '%' || @search || '%'
      or lower(coalesce(v.name, '')) like '%' || @search || '%'
    )
  `;

  const params = {
    tenantId: DEMO_STORE_TENANT_ID,
    status,
    vendorId,
    warehouseId,
    dateFrom,
    dateTo,
    search,
    limit: pageSize,
    offset,
  };

  const total = (
    db
      .prepare(
        `select count(*) as cnt
         from goods_receipts gr
         left join purchase_orders po on po.id = gr.purchase_order_id
         left join vendors v on v.id = gr.vendor_id
         where ${where}`,
      )
      .get(params) as { cnt: number }
  ).cnt;

  const rows = db
    .prepare(
      `select
         gr.id,
         gr.receipt_number as receiptNumber,
         gr.purchase_order_id as purchaseOrderId,
         coalesce(po.po_number, '—') as poNumber,
         gr.vendor_id as vendorId,
         v.name as vendorName,
         gr.warehouse_id as warehouseId,
         coalesce(w.name, '—') as warehouseName,
         gr.status,
         gr.received_at as receivedAt,
         gr.total,
         (
           select count(*) from goods_receipt_items i
           where i.goods_receipt_id = gr.id and i.tenant_id = gr.tenant_id
         ) as itemCount
       from goods_receipts gr
       left join purchase_orders po on po.id = gr.purchase_order_id
       left join vendors v on v.id = gr.vendor_id
       left join warehouses w on w.id = gr.warehouse_id
       where ${where}
       order by gr.received_at desc, gr.created_at desc
       limit @limit offset @offset`,
    )
    .all(params) as Array<{
    id: string;
    receiptNumber: string;
    purchaseOrderId: string;
    poNumber: string;
    vendorId: string | null;
    vendorName: string | null;
    warehouseId: string;
    warehouseName: string;
    status: string;
    receivedAt: string | null;
    total: number;
    itemCount: number;
  }>;

  return {
    items: rows.map((r) => ({
      id: r.id,
      receiptNumber: r.receiptNumber,
      purchaseOrderId: r.purchaseOrderId,
      poNumber: r.poNumber,
      vendorId: r.vendorId,
      vendorName: r.vendorName,
      warehouseId: r.warehouseId,
      warehouseName: r.warehouseName,
      status: r.status as GoodsReceiptStatus,
      receivedAt: r.receivedAt,
      total: Number(r.total),
      itemCount: Number(r.itemCount),
    })) as GoodsReceiptListItem[],
    total,
    page,
    pageSize,
  };
}

export function listVendorReturnsLocal(
  query: VendorReturnListQuery = {},
): PaginatedVendorReturns {
  const db = getLocalDb();
  const { page, pageSize, offset } = pageParams(query.page, query.pageSize);
  const search = query.search?.trim().toLowerCase() ?? "";
  const status = query.status ?? "";
  const vendorId = query.vendorId ?? "";
  const warehouseId = query.warehouseId ?? "";
  const dateFrom = query.dateFrom ?? "";
  const dateTo = query.dateTo ?? "";

  const where = `
    vr.tenant_id = @tenantId
    and (@status = '' or vr.status = @status)
    and (@vendorId = '' or vr.vendor_id = @vendorId)
    and (@warehouseId = '' or vr.warehouse_id = @warehouseId)
    and (@dateFrom = '' or vr.return_date >= @dateFrom)
    and (@dateTo = '' or vr.return_date <= @dateTo)
    and (
      @search = ''
      or lower(vr.return_number) like '%' || @search || '%'
      or exists (
        select 1 from vendors v
        where v.id = vr.vendor_id and lower(v.name) like '%' || @search || '%'
      )
    )
  `;

  const params = {
    tenantId: DEMO_STORE_TENANT_ID,
    status,
    vendorId,
    warehouseId,
    dateFrom,
    dateTo,
    search,
    limit: pageSize,
    offset,
  };

  const total = (
    db
      .prepare(`select count(*) as cnt from vendor_returns vr where ${where}`)
      .get(params) as { cnt: number }
  ).cnt;

  const rows = db
    .prepare(
      `select
         vr.id,
         vr.return_number as returnNumber,
         vr.vendor_id as vendorId,
         coalesce(v.name, '—') as vendorName,
         vr.warehouse_id as warehouseId,
         coalesce(w.name, '—') as warehouseName,
         vr.return_date as returnDate,
         vr.status,
         vr.total,
         (
           select count(*) from vendor_return_items i
           where i.vendor_return_id = vr.id and i.tenant_id = vr.tenant_id
         ) as itemCount
       from vendor_returns vr
       left join vendors v on v.id = vr.vendor_id
       left join warehouses w on w.id = vr.warehouse_id
       where ${where}
       order by vr.return_date desc, vr.created_at desc
       limit @limit offset @offset`,
    )
    .all(params) as Array<{
    id: string;
    returnNumber: string;
    vendorId: string;
    vendorName: string;
    warehouseId: string;
    warehouseName: string;
    returnDate: string;
    status: string;
    total: number;
    itemCount: number;
  }>;

  return {
    items: rows.map((r) => ({
      ...r,
      status: r.status as VendorReturnStatus,
      total: Number(r.total),
      itemCount: Number(r.itemCount),
    })) as VendorReturnListItem[],
    total,
    page,
    pageSize,
  };
}

export function listPendingVendorReturnsLocal(
  vendorId: string,
): import("@blackbox/shared").PendingVendorReturnLine[] {
  const db = getLocalDb();
  const rows = db
    .prepare(
      `select
         i.id as vendorReturnItemId,
         i.vendor_return_id as vendorReturnId,
         vr.return_number as returnNumber,
         i.product_sku_id as productSkuId,
         i.vendor_sku_id as vendorSkuId,
         coalesce(p.name, '—') as productName,
         coalesce(s.variant_name, '') as variantName,
         coalesce(s.sku, '—') as sku,
         i.reason,
         i.quantity,
         i.unit_cost as unitCost,
         pu.name as purchaseUnitName,
         i.units_per_purchase_unit as unitsPerPurchaseUnit
       from vendor_return_items i
       inner join vendor_returns vr on vr.id = i.vendor_return_id
       left join product_skus s on s.id = i.product_sku_id
       left join products p on p.id = s.product_id
       left join units pu on pu.id = i.purchase_unit_id
       where i.tenant_id = ?
         and vr.vendor_id = ?
         and i.settlement is null
       order by i.created_at, i.id`,
    )
    .all(DEMO_STORE_TENANT_ID, vendorId) as Array<Record<string, unknown>>;

  return rows.map((r) => {
    const quantity = Number(r.quantity ?? 0);
    const unitCost = Number(r.unitCost ?? 0);
    return {
      vendorReturnItemId: String(r.vendorReturnItemId),
      vendorReturnId: String(r.vendorReturnId),
      returnNumber: String(r.returnNumber),
      productSkuId: String(r.productSkuId),
      vendorSkuId: (r.vendorSkuId as string | null) ?? null,
      productName: String(r.productName ?? "—"),
      variantName: String(r.variantName ?? ""),
      sku: String(r.sku ?? "—"),
      reason: r.reason as import("@blackbox/shared").VendorReturnReason,
      quantity,
      unitCost,
      lineTotal: Math.round(quantity * unitCost * 10000) / 10000,
      purchaseUnitName: (r.purchaseUnitName as string | null) ?? null,
      unitsPerPurchaseUnit: Number(r.unitsPerPurchaseUnit ?? 1) || 1,
    };
  });
}

export function lastPurchaseCostLocal(
  vendorId: string,
  productSkuId: string,
): number {
  const db = getLocalDb();
  const fromGr = db
    .prepare(
      `select i.receiving_unit_cost as unitCost
       from goods_receipt_items i
       inner join goods_receipts g on g.id = i.goods_receipt_id
       where i.tenant_id = ? and i.product_sku_id = ? and g.vendor_id = ?
         and g.status = 'POSTED'
       order by g.received_at desc, i.created_at desc
       limit 1`,
    )
    .get(DEMO_STORE_TENANT_ID, productSkuId, vendorId) as
    | { unitCost: number }
    | undefined;
  if (fromGr) return Number(fromGr.unitCost ?? 0);

  const fromPo = db
    .prepare(
      `select i.unit_cost as unitCost
       from purchase_order_items i
       inner join purchase_orders po on po.id = i.purchase_order_id
       where i.tenant_id = ? and i.product_sku_id = ? and po.vendor_id = ?
       order by po.updated_at desc
       limit 1`,
    )
    .get(DEMO_STORE_TENANT_ID, productSkuId, vendorId) as
    | { unitCost: number }
    | undefined;
  if (fromPo) return Number(fromPo.unitCost ?? 0);

  const fromVs = db
    .prepare(
      `select purchase_price as unitCost
       from vendor_skus
       where tenant_id = ? and vendor_id = ? and product_sku_id = ?
         and status = 'active'
       limit 1`,
    )
    .get(DEMO_STORE_TENANT_ID, vendorId, productSkuId) as
    | { unitCost: number }
    | undefined;
  return Number(fromVs?.unitCost ?? 0);
}

export function listPoNumbersLocal(): string[] {
  const db = getLocalDb();
  const rows = db
    .prepare(
      `select po_number as poNumber from purchase_orders where tenant_id = @tenantId`,
    )
    .all({ tenantId: DEMO_STORE_TENANT_ID }) as Array<{ poNumber: string }>;
  return rows.map((r) => String(r.poNumber));
}

export function listReceiptNumbersLocal(): string[] {
  const db = getLocalDb();
  const rows = db
    .prepare(
      `select receipt_number as receiptNumber from goods_receipts where tenant_id = @tenantId`,
    )
    .all({ tenantId: DEMO_STORE_TENANT_ID }) as Array<{ receiptNumber: string }>;
  return rows.map((r) => String(r.receiptNumber));
}
