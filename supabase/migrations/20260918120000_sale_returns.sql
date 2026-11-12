-- Customer sale returns against posted sales (manager/owner).

create table if not exists public.sale_returns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  return_number text not null,
  sale_id uuid not null references public.sales (id) on delete restrict,
  warehouse_id uuid not null references public.warehouses (id) on delete restrict,
  return_date date not null,
  status text not null default 'POSTED',
  subtotal numeric(14, 4) not null default 0,
  gst_rate numeric(8, 4) not null default 0,
  gst_amount numeric(14, 4) not null default 0,
  sales_tax_rate numeric(8, 4) not null default 0,
  sales_tax_amount numeric(14, 4) not null default 0,
  refund_total numeric(14, 4) not null default 0,
  refund_method text not null default 'CASH',
  notes text not null default '',
  processed_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sale_returns_tenant_return_number_key unique (tenant_id, return_number),
  constraint sale_returns_status_check check (status in ('POSTED')),
  constraint sale_returns_refund_method_check check (
    refund_method in ('CASH', 'CARD', 'CREDIT')
  )
);

create index if not exists sale_returns_tenant_id_idx on public.sale_returns (tenant_id);
create index if not exists sale_returns_sale_id_idx on public.sale_returns (sale_id);
create index if not exists sale_returns_warehouse_id_idx on public.sale_returns (warehouse_id);
create index if not exists sale_returns_return_date_idx on public.sale_returns (return_date);

create table if not exists public.sale_return_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  sale_return_id uuid not null references public.sale_returns (id) on delete cascade,
  sale_line_id uuid not null references public.sale_lines (id) on delete restrict,
  product_sku_id uuid not null references public.product_skus (id) on delete restrict,
  quantity numeric(14, 4) not null,
  unit_price numeric(14, 4) not null default 0,
  discount_percent numeric(8, 4) not null default 0,
  line_total numeric(14, 4) not null default 0,
  sell_unit text not null default 'pc',
  barcode text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sale_return_lines_quantity_check check (quantity > 0),
  constraint sale_return_lines_sell_unit_check check (sell_unit in ('pc', 'box'))
);

create index if not exists sale_return_lines_tenant_id_idx on public.sale_return_lines (tenant_id);
create index if not exists sale_return_lines_return_id_idx on public.sale_return_lines (sale_return_id);
create index if not exists sale_return_lines_sale_line_id_idx on public.sale_return_lines (sale_line_id);
create index if not exists sale_return_lines_product_sku_id_idx on public.sale_return_lines (product_sku_id);

alter table public.inventory_movements
  drop constraint if exists inventory_movements_type_check;

alter table public.inventory_movements
  add constraint inventory_movements_type_check check (
    movement_type in (
      'OPENING_BALANCE',
      'PURCHASE_RECEIPT',
      'SALE',
      'SALE_RETURN',
      'STOCK_ADJUSTMENT',
      'TRANSFER_IN',
      'TRANSFER_OUT',
      'RETURN',
      'INVENTORY_OUT',
      'INVENTORY_OUT_RETURN'
    )
  );

alter table public.activity_logs
  drop constraint if exists activity_logs_event_type_check;

alter table public.activity_logs
  add constraint activity_logs_event_type_check check (
    event_type in (
      'sale.line_removed',
      'sale.foc_posted',
      'sale.return_posted',
      'till.opened',
      'till.cash_collected',
      'till.limit_reached',
      'till.withdrawn_full',
      'till.reopened',
      'till.closed'
    )
  );

insert into public.permissions (key, description)
values ('sales.return', 'Process customer sale returns')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = 'sales.return'
where r.key in ('OWNER', 'MANAGER')
on conflict do nothing;
