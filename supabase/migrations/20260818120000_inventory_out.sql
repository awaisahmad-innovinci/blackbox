-- Inventory Out Phase 1: movement type + inventory_outs / inventory_out_items
-- Idempotent: creates tables if missing, or aligns an earlier draft schema.

alter table public.inventory_movements
  drop constraint if exists inventory_movements_type_check;

alter table public.inventory_movements
  add constraint inventory_movements_type_check check (
    movement_type in (
      'OPENING_BALANCE',
      'PURCHASE_RECEIPT',
      'SALE',
      'STOCK_ADJUSTMENT',
      'TRANSFER_IN',
      'TRANSFER_OUT',
      'RETURN',
      'INVENTORY_OUT'
    )
  );

create table if not exists public.inventory_outs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  out_number text not null,
  warehouse_id uuid not null references public.warehouses (id) on delete restrict,
  out_date date not null,
  reference text,
  notes text not null default '',
  status text not null default 'POSTED',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_outs_status_check check (status in ('POSTED', 'CANCELLED')),
  constraint inventory_outs_tenant_out_number_key unique (tenant_id, out_number)
);

-- Align draft column names / drop extras if an earlier schema existed
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'inventory_outs'
      and column_name = 'reference_number'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'inventory_outs'
      and column_name = 'reference'
  ) then
    alter table public.inventory_outs rename column reference_number to reference;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'inventory_outs'
      and column_name = 'reference'
  ) then
    alter table public.inventory_outs add column reference text;
  end if;
end $$;

alter table public.inventory_outs drop column if exists total_quantity;
alter table public.inventory_outs drop column if exists total_cost;

alter table public.inventory_outs drop constraint if exists inventory_outs_status_check;
alter table public.inventory_outs
  add constraint inventory_outs_status_check check (status in ('POSTED', 'CANCELLED'));

create index if not exists inventory_outs_tenant_id_idx
  on public.inventory_outs (tenant_id);
create index if not exists inventory_outs_warehouse_id_idx
  on public.inventory_outs (warehouse_id);

create table if not exists public.inventory_out_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  inventory_out_id uuid not null references public.inventory_outs (id) on delete cascade,
  product_sku_id uuid not null references public.product_skus (id) on delete restrict,
  quantity numeric(14, 4) not null,
  unit_cost numeric(14, 4) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_out_items_quantity_check check (quantity > 0)
);

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'inventory_out_items'
      and column_name = 'average_cost'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'inventory_out_items'
      and column_name = 'unit_cost'
  ) then
    alter table public.inventory_out_items rename column average_cost to unit_cost;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'inventory_out_items'
      and column_name = 'unit_cost'
  ) then
    alter table public.inventory_out_items
      add column unit_cost numeric(14, 4) not null default 0;
  end if;
end $$;

alter table public.inventory_out_items drop column if exists product_name;
alter table public.inventory_out_items drop column if exists sku_code;
alter table public.inventory_out_items drop column if exists barcode;
alter table public.inventory_out_items drop column if exists unit_name;
alter table public.inventory_out_items drop column if exists line_total;

alter table public.inventory_out_items drop constraint if exists inventory_out_items_quantity_check;
alter table public.inventory_out_items
  add constraint inventory_out_items_quantity_check check (quantity > 0);

create index if not exists inventory_out_items_tenant_id_idx
  on public.inventory_out_items (tenant_id);
create index if not exists inventory_out_items_out_id_idx
  on public.inventory_out_items (inventory_out_id);
create index if not exists inventory_out_items_product_sku_id_idx
  on public.inventory_out_items (product_sku_id);
