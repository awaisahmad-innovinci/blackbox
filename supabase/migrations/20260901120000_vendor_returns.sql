-- Vendor returns: document + line items; goods receipt cashback credit.

create table if not exists public.vendor_returns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  return_number text not null,
  vendor_id uuid not null references public.vendors (id) on delete restrict,
  warehouse_id uuid not null references public.warehouses (id) on delete restrict,
  return_date date not null,
  notes text not null default '',
  status text not null default 'OPEN',
  subtotal numeric(14, 4) not null default 0,
  total numeric(14, 4) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vendor_returns_status_check check (status in ('OPEN', 'SETTLED')),
  constraint vendor_returns_tenant_return_number_key unique (tenant_id, return_number)
);

create index if not exists vendor_returns_tenant_id_idx
  on public.vendor_returns (tenant_id);
create index if not exists vendor_returns_vendor_id_idx
  on public.vendor_returns (vendor_id);
create index if not exists vendor_returns_warehouse_id_idx
  on public.vendor_returns (warehouse_id);

create table if not exists public.vendor_return_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  vendor_return_id uuid not null references public.vendor_returns (id) on delete cascade,
  product_sku_id uuid not null references public.product_skus (id) on delete restrict,
  vendor_sku_id uuid references public.vendor_skus (id) on delete restrict,
  purchase_unit_id uuid references public.units (id) on delete restrict,
  units_per_purchase_unit numeric(14, 4) not null default 1,
  quantity numeric(14, 4) not null,
  unit_cost numeric(14, 4) not null default 0,
  reason text not null,
  settlement text,
  goods_receipt_id uuid references public.goods_receipts (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vendor_return_items_quantity_check check (quantity > 0),
  constraint vendor_return_items_reason_check check (
    reason in ('EXPIRED', 'BROKEN', 'DAMAGED', 'OTHER')
  ),
  constraint vendor_return_items_settlement_check check (
    settlement is null or settlement in ('CASHBACK', 'REPLACE')
  )
);

create index if not exists vendor_return_items_tenant_id_idx
  on public.vendor_return_items (tenant_id);
create index if not exists vendor_return_items_return_id_idx
  on public.vendor_return_items (vendor_return_id);
create index if not exists vendor_return_items_product_sku_id_idx
  on public.vendor_return_items (product_sku_id);
create index if not exists vendor_return_items_open_idx
  on public.vendor_return_items (tenant_id, settlement)
  where settlement is null;

alter table public.goods_receipts
  add column if not exists return_credit numeric(14, 4) not null default 0;
