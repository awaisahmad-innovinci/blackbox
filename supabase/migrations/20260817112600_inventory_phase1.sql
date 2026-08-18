-- Inventory Phase 1 schema (warehouse / catalog / purchasing foundation).
-- Demo Store tenant id (fixed for Phase A single-user desktop): a0000000-0000-4000-8000-000000000001

-- ---------------------------------------------------------------------------
-- Seed Demo Store tenant (idempotent)
-- ---------------------------------------------------------------------------
insert into public.tenants (id, name, is_active, business_type, country, currency, onboarding_completed_at)
values (
  'a0000000-0000-4000-8000-000000000001',
  'Demo Store',
  true,
  'RETAIL_LIGHT',
  'PK',
  'PKR',
  now()
)
on conflict (id) do update set
  name = excluded.name,
  is_active = true;

-- ---------------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------------
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  description text not null default '',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_status_check check (status in ('active', 'inactive')),
  constraint categories_tenant_id_name_key unique (tenant_id, name)
);
create index if not exists categories_tenant_id_idx on public.categories (tenant_id);

-- ---------------------------------------------------------------------------
-- brands
-- ---------------------------------------------------------------------------
create table if not exists public.brands (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  description text not null default '',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint brands_status_check check (status in ('active', 'inactive')),
  constraint brands_tenant_id_name_key unique (tenant_id, name)
);
create index if not exists brands_tenant_id_idx on public.brands (tenant_id);

-- ---------------------------------------------------------------------------
-- units
-- ---------------------------------------------------------------------------
create table if not exists public.units (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  abbreviation text not null,
  type text not null default 'count',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint units_status_check check (status in ('active', 'inactive')),
  constraint units_type_check check (type in ('count', 'weight', 'volume', 'length', 'other')),
  constraint units_tenant_id_abbreviation_key unique (tenant_id, abbreviation)
);
create index if not exists units_tenant_id_idx on public.units (tenant_id);

-- ---------------------------------------------------------------------------
-- products
-- ---------------------------------------------------------------------------
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  brand_id uuid references public.brands (id) on delete set null,
  category_id uuid references public.categories (id) on delete set null,
  description text not null default '',
  image_path text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_status_check check (status in ('active', 'inactive'))
);
create index if not exists products_tenant_id_idx on public.products (tenant_id);
create index if not exists products_brand_id_idx on public.products (brand_id);
create index if not exists products_category_id_idx on public.products (category_id);
create index if not exists products_status_idx on public.products (status);

-- ---------------------------------------------------------------------------
-- product_skus
-- ---------------------------------------------------------------------------
create table if not exists public.product_skus (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  sku text not null,
  barcode text,
  variant_name text not null default '',
  size_value text,
  size_unit text,
  base_unit_id uuid references public.units (id) on delete set null,
  cost_price numeric(14, 4) not null default 0,
  selling_price numeric(14, 4) not null default 0,
  reorder_level numeric(14, 4) not null default 0,
  track_inventory boolean not null default true,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_skus_status_check check (status in ('active', 'inactive')),
  constraint product_skus_tenant_id_sku_key unique (tenant_id, sku),
  constraint product_skus_tenant_id_barcode_key unique (tenant_id, barcode)
);
create index if not exists product_skus_tenant_id_idx on public.product_skus (tenant_id);
create index if not exists product_skus_product_id_idx on public.product_skus (product_id);
create index if not exists product_skus_sku_idx on public.product_skus (sku);

-- ---------------------------------------------------------------------------
-- vendors
-- ---------------------------------------------------------------------------
create table if not exists public.vendors (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  vendor_code text not null,
  contact_person text,
  phone text,
  email text,
  address text,
  city text,
  country text,
  tax_number text,
  notes text not null default '',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vendors_status_check check (status in ('active', 'inactive')),
  constraint vendors_tenant_id_vendor_code_key unique (tenant_id, vendor_code)
);
create index if not exists vendors_tenant_id_idx on public.vendors (tenant_id);

-- ---------------------------------------------------------------------------
-- vendor_skus
-- ---------------------------------------------------------------------------
create table if not exists public.vendor_skus (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  vendor_id uuid not null references public.vendors (id) on delete cascade,
  product_sku_id uuid not null references public.product_skus (id) on delete cascade,
  vendor_sku_code text,
  purchase_unit_id uuid references public.units (id) on delete set null,
  units_per_purchase_unit numeric(14, 4) not null default 1,
  purchase_price numeric(14, 4) not null default 0,
  minimum_order_quantity numeric(14, 4) not null default 1,
  lead_time_days integer not null default 0,
  is_preferred boolean not null default false,
  status text not null default 'active',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vendor_skus_status_check check (status in ('active', 'inactive')),
  constraint vendor_skus_tenant_vendor_sku_key unique (tenant_id, vendor_id, product_sku_id)
);
create index if not exists vendor_skus_tenant_id_idx on public.vendor_skus (tenant_id);
create index if not exists vendor_skus_vendor_id_idx on public.vendor_skus (vendor_id);
create index if not exists vendor_skus_product_sku_id_idx on public.vendor_skus (product_sku_id);

-- ---------------------------------------------------------------------------
-- warehouses
-- ---------------------------------------------------------------------------
create table if not exists public.warehouses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  code text not null,
  location text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint warehouses_status_check check (status in ('active', 'inactive')),
  constraint warehouses_tenant_id_code_key unique (tenant_id, code)
);
create index if not exists warehouses_tenant_id_idx on public.warehouses (tenant_id);

-- ---------------------------------------------------------------------------
-- inventory_stock
-- ---------------------------------------------------------------------------
create table if not exists public.inventory_stock (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  product_sku_id uuid not null references public.product_skus (id) on delete cascade,
  warehouse_id uuid not null references public.warehouses (id) on delete cascade,
  quantity_on_hand numeric(14, 4) not null default 0,
  quantity_reserved numeric(14, 4) not null default 0,
  quantity_available numeric(14, 4) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_stock_tenant_sku_wh_key unique (tenant_id, product_sku_id, warehouse_id)
);
create index if not exists inventory_stock_tenant_id_idx on public.inventory_stock (tenant_id);
create index if not exists inventory_stock_product_sku_id_idx on public.inventory_stock (product_sku_id);
create index if not exists inventory_stock_warehouse_id_idx on public.inventory_stock (warehouse_id);

-- ---------------------------------------------------------------------------
-- inventory_movements
-- ---------------------------------------------------------------------------
create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  product_sku_id uuid not null references public.product_skus (id) on delete cascade,
  warehouse_id uuid not null references public.warehouses (id) on delete cascade,
  movement_type text not null,
  quantity numeric(14, 4) not null,
  reference_type text,
  reference_id uuid,
  reason text not null default '',
  created_at timestamptz not null default now(),
  constraint inventory_movements_type_check check (
    movement_type in (
      'OPENING_BALANCE',
      'PURCHASE_RECEIPT',
      'SALE',
      'STOCK_ADJUSTMENT',
      'TRANSFER_IN',
      'TRANSFER_OUT',
      'RETURN'
    )
  )
);
create index if not exists inventory_movements_tenant_id_idx on public.inventory_movements (tenant_id);
create index if not exists inventory_movements_product_sku_id_idx on public.inventory_movements (product_sku_id);
create index if not exists inventory_movements_warehouse_id_idx on public.inventory_movements (warehouse_id);
create index if not exists inventory_movements_created_at_idx on public.inventory_movements (created_at);

-- ---------------------------------------------------------------------------
-- purchase_orders
-- ---------------------------------------------------------------------------
create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  po_number text not null,
  vendor_id uuid not null references public.vendors (id) on delete restrict,
  warehouse_id uuid not null references public.warehouses (id) on delete restrict,
  status text not null default 'DRAFT',
  order_date date not null default current_date,
  expected_date date,
  subtotal numeric(14, 4) not null default 0,
  discount numeric(14, 4) not null default 0,
  tax numeric(14, 4) not null default 0,
  total numeric(14, 4) not null default 0,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchase_orders_status_check check (
    status in ('DRAFT', 'SUBMITTED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED')
  ),
  constraint purchase_orders_tenant_po_number_key unique (tenant_id, po_number)
);
create index if not exists purchase_orders_tenant_id_idx on public.purchase_orders (tenant_id);
create index if not exists purchase_orders_vendor_id_idx on public.purchase_orders (vendor_id);
create index if not exists purchase_orders_status_idx on public.purchase_orders (status);

-- ---------------------------------------------------------------------------
-- purchase_order_items
-- ---------------------------------------------------------------------------
create table if not exists public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  purchase_order_id uuid not null references public.purchase_orders (id) on delete cascade,
  product_sku_id uuid not null references public.product_skus (id) on delete restrict,
  vendor_sku_id uuid references public.vendor_skus (id) on delete set null,
  quantity numeric(14, 4) not null,
  unit_cost numeric(14, 4) not null,
  tax numeric(14, 4) not null default 0,
  discount numeric(14, 4) not null default 0,
  line_total numeric(14, 4) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists purchase_order_items_tenant_id_idx on public.purchase_order_items (tenant_id);
create index if not exists purchase_order_items_po_id_idx on public.purchase_order_items (purchase_order_id);

-- ---------------------------------------------------------------------------
-- goods_receipts
-- ---------------------------------------------------------------------------
create table if not exists public.goods_receipts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  receipt_number text not null,
  purchase_order_id uuid not null references public.purchase_orders (id) on delete restrict,
  warehouse_id uuid not null references public.warehouses (id) on delete restrict,
  status text not null default 'DRAFT',
  received_at timestamptz,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint goods_receipts_status_check check (status in ('DRAFT', 'POSTED', 'CANCELLED')),
  constraint goods_receipts_tenant_receipt_number_key unique (tenant_id, receipt_number)
);
create index if not exists goods_receipts_tenant_id_idx on public.goods_receipts (tenant_id);
create index if not exists goods_receipts_po_id_idx on public.goods_receipts (purchase_order_id);

-- ---------------------------------------------------------------------------
-- goods_receipt_items
-- ---------------------------------------------------------------------------
create table if not exists public.goods_receipt_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  goods_receipt_id uuid not null references public.goods_receipts (id) on delete cascade,
  purchase_order_item_id uuid references public.purchase_order_items (id) on delete set null,
  product_sku_id uuid not null references public.product_skus (id) on delete restrict,
  ordered_quantity numeric(14, 4) not null default 0,
  received_quantity numeric(14, 4) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists goods_receipt_items_tenant_id_idx on public.goods_receipt_items (tenant_id);
create index if not exists goods_receipt_items_gr_id_idx on public.goods_receipt_items (goods_receipt_id);

-- ===========================================================================
-- SEED DATA (Demo Store)
-- ===========================================================================
do $$
declare
  tid uuid := 'a0000000-0000-4000-8000-000000000001';
  cat_bev uuid := 'b1000000-0000-4000-8000-000000000001';
  cat_snacks uuid := 'b1000000-0000-4000-8000-000000000002';
  cat_grocery uuid := 'b1000000-0000-4000-8000-000000000003';
  cat_pc uuid := 'b1000000-0000-4000-8000-000000000004';
  brand_pepsi uuid := 'b2000000-0000-4000-8000-000000000001';
  brand_coke uuid := 'b2000000-0000-4000-8000-000000000002';
  brand_nestle uuid := 'b2000000-0000-4000-8000-000000000003';
  brand_ul uuid := 'b2000000-0000-4000-8000-000000000004';
  unit_pc uuid := 'b3000000-0000-4000-8000-000000000001';
  unit_btl uuid := 'b3000000-0000-4000-8000-000000000002';
  unit_box uuid := 'b3000000-0000-4000-8000-000000000003';
  prod_pepsi uuid := 'c1000000-0000-4000-8000-000000000001';
  prod_coke uuid := 'c1000000-0000-4000-8000-000000000002';
  prod_water uuid := 'c1000000-0000-4000-8000-000000000003';
  sku_p1 uuid := 'c2000000-0000-4000-8000-000000000001';
  sku_p5 uuid := 'c2000000-0000-4000-8000-000000000002';
  sku_p3 uuid := 'c2000000-0000-4000-8000-000000000003';
  sku_c1 uuid := 'c2000000-0000-4000-8000-000000000004';
  sku_c5 uuid := 'c2000000-0000-4000-8000-000000000005';
  vend_abc uuid := 'd1000000-0000-4000-8000-000000000001';
  vend_xyz uuid := 'd1000000-0000-4000-8000-000000000002';
  vend_nat uuid := 'd1000000-0000-4000-8000-000000000003';
  wh_main uuid := 'e1000000-0000-4000-8000-000000000001';
  po1 uuid := 'f1000000-0000-4000-8000-000000000001';
  gr1 uuid := 'f2000000-0000-4000-8000-000000000001';
begin
  insert into public.categories (id, tenant_id, name, description) values
    (cat_bev, tid, 'Beverages', 'Drinks'),
    (cat_snacks, tid, 'Snacks', 'Snack foods'),
    (cat_grocery, tid, 'Grocery', 'Grocery staples'),
    (cat_pc, tid, 'Personal Care', 'Personal care')
  on conflict (tenant_id, name) do nothing;

  insert into public.brands (id, tenant_id, name) values
    (brand_pepsi, tid, 'Pepsi'),
    (brand_coke, tid, 'Coca Cola'),
    (brand_nestle, tid, 'Nestle'),
    (brand_ul, tid, 'Unilever')
  on conflict (tenant_id, name) do nothing;

  insert into public.units (id, tenant_id, name, abbreviation, type) values
    (unit_pc, tid, 'Piece', 'pc', 'count'),
    (unit_btl, tid, 'Bottle', 'btl', 'count'),
    (unit_box, tid, 'Box', 'box', 'count')
  on conflict (tenant_id, abbreviation) do nothing;

  insert into public.products (id, tenant_id, name, brand_id, category_id, description) values
    (prod_pepsi, tid, 'Pepsi', brand_pepsi, cat_bev, 'Pepsi soft drink'),
    (prod_coke, tid, 'Coca Cola', brand_coke, cat_bev, 'Coca Cola soft drink'),
    (prod_water, tid, 'Nestle Water', brand_nestle, cat_bev, 'Bottled water')
  on conflict (id) do nothing;

  insert into public.product_skus (
    id, tenant_id, product_id, sku, barcode, variant_name, size_value, size_unit,
    base_unit_id, cost_price, selling_price, reorder_level
  ) values
    (sku_p1, tid, prod_pepsi, 'PEPSI-1L', '8901000000011', '1 Liter', '1', 'L', unit_btl, 90, 120, 20),
    (sku_p5, tid, prod_pepsi, 'PEPSI-500', '8901000000012', '500ml', '500', 'ml', unit_btl, 55, 75, 30),
    (sku_p3, tid, prod_pepsi, 'PEPSI-330', '8901000000013', '330ml', '330', 'ml', unit_btl, 40, 55, 40),
    (sku_c1, tid, prod_coke, 'COKE-1L', '8901000000021', '1 Liter', '1', 'L', unit_btl, 88, 118, 20),
    (sku_c5, tid, prod_coke, 'COKE-500', '8901000000022', '500ml', '500', 'ml', unit_btl, 52, 72, 30)
  on conflict (id) do nothing;

  insert into public.vendors (id, tenant_id, name, vendor_code, contact_person, phone, city, country) values
    (vend_abc, tid, 'ABC Distributors', 'ABC', 'Ali', '0300-1111111', 'Karachi', 'PK'),
    (vend_xyz, tid, 'XYZ Wholesale', 'XYZ', 'Sara', '0300-2222222', 'Lahore', 'PK'),
    (vend_nat, tid, 'National Beverages', 'NAT', 'Omar', '0300-3333333', 'Islamabad', 'PK')
  on conflict (tenant_id, vendor_code) do nothing;

  insert into public.vendor_skus (
    id, tenant_id, vendor_id, product_sku_id, vendor_sku_code, purchase_unit_id,
    units_per_purchase_unit, purchase_price, minimum_order_quantity, lead_time_days, is_preferred
  ) values
    ('d2000000-0000-4000-8000-000000000001', tid, vend_abc, sku_p1, 'ABC-P1L', unit_btl, 1, 90, 10, 2, true),
    ('d2000000-0000-4000-8000-000000000002', tid, vend_abc, sku_p5, 'ABC-P500', unit_btl, 1, 55, 20, 2, true),
    ('d2000000-0000-4000-8000-000000000003', tid, vend_abc, sku_c1, 'ABC-C1L', unit_btl, 1, 88, 10, 2, false),
    ('d2000000-0000-4000-8000-000000000004', tid, vend_xyz, sku_p1, 'XYZ-P1L', unit_btl, 1, 92, 12, 3, false),
    ('d2000000-0000-4000-8000-000000000005', tid, vend_xyz, sku_p5, 'XYZ-P500', unit_btl, 1, 57, 24, 3, false),
    ('d2000000-0000-4000-8000-000000000006', tid, vend_xyz, sku_c5, 'XYZ-C500', unit_btl, 1, 52, 24, 3, true),
    ('d2000000-0000-4000-8000-000000000007', tid, vend_nat, sku_p1, 'NAT-P1L', unit_btl, 1, 89, 8, 1, false)
  on conflict (tenant_id, vendor_id, product_sku_id) do nothing;

  insert into public.warehouses (id, tenant_id, name, code, location) values
    (wh_main, tid, 'Main Warehouse', 'MAIN', 'Karachi')
  on conflict (tenant_id, code) do nothing;

  insert into public.inventory_stock (
    id, tenant_id, product_sku_id, warehouse_id,
    quantity_on_hand, quantity_reserved, quantity_available
  ) values
    ('e2000000-0000-4000-8000-000000000001', tid, sku_p1, wh_main, 45, 0, 45),
    ('e2000000-0000-4000-8000-000000000002', tid, sku_p5, wh_main, 18, 0, 18),
    ('e2000000-0000-4000-8000-000000000003', tid, sku_p3, wh_main, 80, 0, 80),
    ('e2000000-0000-4000-8000-000000000004', tid, sku_c1, wh_main, 12, 0, 12),
    ('e2000000-0000-4000-8000-000000000005', tid, sku_c5, wh_main, 55, 0, 55)
  on conflict (tenant_id, product_sku_id, warehouse_id) do nothing;

  insert into public.inventory_movements (
    id, tenant_id, product_sku_id, warehouse_id, movement_type, quantity, reason
  ) values
    ('e3000000-0000-4000-8000-000000000001', tid, sku_p1, wh_main, 'OPENING_BALANCE', 45, 'Opening'),
    ('e3000000-0000-4000-8000-000000000002', tid, sku_p5, wh_main, 'OPENING_BALANCE', 18, 'Opening'),
    ('e3000000-0000-4000-8000-000000000003', tid, sku_p3, wh_main, 'OPENING_BALANCE', 80, 'Opening'),
    ('e3000000-0000-4000-8000-000000000004', tid, sku_c1, wh_main, 'OPENING_BALANCE', 12, 'Opening'),
    ('e3000000-0000-4000-8000-000000000005', tid, sku_c5, wh_main, 'OPENING_BALANCE', 55, 'Opening')
  on conflict (id) do nothing;

  insert into public.purchase_orders (
    id, tenant_id, po_number, vendor_id, warehouse_id, status,
    order_date, expected_date, subtotal, total, notes
  ) values
    (po1, tid, 'PO-1001', vend_abc, wh_main, 'SUBMITTED', current_date, current_date + 7, 900, 900, 'Sample pending PO')
  on conflict (tenant_id, po_number) do nothing;

  insert into public.purchase_order_items (
    id, tenant_id, purchase_order_id, product_sku_id, vendor_sku_id,
    quantity, unit_cost, line_total
  ) values
    ('f1100000-0000-4000-8000-000000000001', tid, po1, sku_p1, 'd2000000-0000-4000-8000-000000000001', 10, 90, 900)
  on conflict (id) do nothing;

  insert into public.goods_receipts (
    id, tenant_id, receipt_number, purchase_order_id, warehouse_id, status, received_at
  ) values
    (gr1, tid, 'GR-1001', po1, wh_main, 'POSTED', now() - interval '2 days')
  on conflict (tenant_id, receipt_number) do nothing;

  insert into public.goods_receipt_items (
    id, tenant_id, goods_receipt_id, purchase_order_item_id, product_sku_id,
    ordered_quantity, received_quantity
  ) values
    ('f2100000-0000-4000-8000-000000000001', tid, gr1, 'f1100000-0000-4000-8000-000000000001', sku_p1, 10, 6)
  on conflict (id) do nothing;
end $$;
