-- POS sales bills, lines, payments, and sales permissions.

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  warehouse_id uuid not null references public.warehouses (id) on delete restrict,
  sale_number text not null,
  status text not null default 'POSTED',
  subtotal numeric(14, 4) not null default 0,
  gst_rate numeric(8, 4) not null default 0,
  gst_amount numeric(14, 4) not null default 0,
  sales_tax_rate numeric(8, 4) not null default 0,
  sales_tax_amount numeric(14, 4) not null default 0,
  total numeric(14, 4) not null default 0,
  device_id uuid references public.devices (id) on delete set null,
  posted_by uuid references public.users (id) on delete set null,
  posted_at timestamptz,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_tenant_sale_number_key unique (tenant_id, sale_number),
  constraint sales_status_check check (status in ('DRAFT', 'POSTED', 'VOID'))
);

create index if not exists sales_tenant_id_idx on public.sales (tenant_id);
create index if not exists sales_warehouse_id_idx on public.sales (warehouse_id);
create index if not exists sales_posted_at_idx on public.sales (posted_at);

create table if not exists public.sale_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  sale_id uuid not null references public.sales (id) on delete cascade,
  product_sku_id uuid not null references public.product_skus (id) on delete restrict,
  quantity numeric(14, 4) not null,
  unit_price numeric(14, 4) not null default 0,
  line_total numeric(14, 4) not null default 0,
  sell_unit text not null default 'pc',
  barcode text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sale_lines_quantity_check check (quantity > 0),
  constraint sale_lines_sell_unit_check check (sell_unit in ('pc', 'box'))
);

create index if not exists sale_lines_tenant_id_idx on public.sale_lines (tenant_id);
create index if not exists sale_lines_sale_id_idx on public.sale_lines (sale_id);
create index if not exists sale_lines_product_sku_id_idx on public.sale_lines (product_sku_id);

create table if not exists public.sale_payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  sale_id uuid not null references public.sales (id) on delete cascade,
  method text not null,
  amount numeric(14, 4) not null,
  reference text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sale_payments_method_check check (method in ('CASH', 'CARD', 'CREDIT')),
  constraint sale_payments_amount_check check (amount > 0)
);

create index if not exists sale_payments_tenant_id_idx on public.sale_payments (tenant_id);
create index if not exists sale_payments_sale_id_idx on public.sale_payments (sale_id);

insert into public.permissions (key, description)
values
  ('sales.read', 'View sales bills and receipts'),
  ('sales.write', 'Create and post sales bills'),
  ('sales.void', 'Void posted sales bills')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in ('sales.read', 'sales.write')
where r.key in ('OWNER', 'MANAGER', 'CASHIER')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = 'sales.void'
where r.key in ('OWNER', 'MANAGER')
on conflict do nothing;
