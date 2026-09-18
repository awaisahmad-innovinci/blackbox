-- Inventory out: document lines, POS balance on inventory_out_items, return history.

alter table public.inventory_movements
  drop constraint if exists inventory_movements_type_check;

-- Ghost dev migration used INVENTORY_RETURN; canonical name is INVENTORY_OUT_RETURN.
update public.inventory_movements
set movement_type = 'INVENTORY_OUT_RETURN'
where movement_type = 'INVENTORY_RETURN';

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
      'INVENTORY_OUT',
      'INVENTORY_OUT_RETURN'
    )
  );

-- Document line items (audit per out bill).
create table if not exists public.inventory_out_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  inventory_out_id uuid not null references public.inventory_outs (id) on delete cascade,
  product_sku_id uuid not null references public.product_skus (id) on delete restrict,
  quantity numeric(14, 4) not null,
  unit_cost numeric(14, 4) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_out_lines_quantity_check check (quantity > 0)
);

create index if not exists inventory_out_lines_tenant_id_idx
  on public.inventory_out_lines (tenant_id);
create index if not exists inventory_out_lines_out_id_idx
  on public.inventory_out_lines (inventory_out_id);
create index if not exists inventory_out_lines_product_sku_id_idx
  on public.inventory_out_lines (product_sku_id);

insert into public.inventory_out_lines (
  id,
  tenant_id,
  inventory_out_id,
  product_sku_id,
  quantity,
  unit_cost,
  created_at,
  updated_at
)
select
  ioi.id,
  ioi.tenant_id,
  ioi.inventory_out_id,
  ioi.product_sku_id,
  ioi.quantity,
  ioi.unit_cost,
  ioi.created_at,
  ioi.updated_at
from public.inventory_out_items ioi
where exists (
  select 1
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'inventory_out_items'
    and c.column_name = 'inventory_out_id'
)
on conflict (id) do nothing;

-- Reshape inventory_out_items into POS balance (one row per warehouse + SKU).
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'inventory_out_items'
      and column_name = 'inventory_out_id'
  ) then
    create temp table _inventory_out_balances on commit drop as
    select
      (array_agg(ioi.id order by ioi.created_at, ioi.id))[1] as id,
      ioi.tenant_id,
      io.warehouse_id,
      ioi.product_sku_id,
      sum(ioi.quantity) as quantity,
      (array_agg(ioi.unit_cost order by ioi.updated_at desc, ioi.id desc))[1] as unit_cost,
      min(ioi.created_at) as created_at,
      max(ioi.updated_at) as updated_at
    from public.inventory_out_items ioi
    inner join public.inventory_outs io on io.id = ioi.inventory_out_id
    group by ioi.tenant_id, io.warehouse_id, ioi.product_sku_id
    having sum(ioi.quantity) > 0;

    truncate public.inventory_out_items;

    alter table public.inventory_out_items
      drop constraint if exists inventory_out_items_inventory_out_id_fkey;
    alter table public.inventory_out_items drop column if exists inventory_out_id;

    alter table public.inventory_out_items
      add column if not exists warehouse_id uuid references public.warehouses (id) on delete restrict;

    insert into public.inventory_out_items (
      id,
      tenant_id,
      warehouse_id,
      product_sku_id,
      quantity,
      unit_cost,
      created_at,
      updated_at
    )
    select
      id,
      tenant_id,
      warehouse_id,
      product_sku_id,
      quantity,
      unit_cost,
      created_at,
      updated_at
    from _inventory_out_balances;

    alter table public.inventory_out_items
      alter column warehouse_id set not null;
  end if;
end $$;

drop index if exists inventory_out_items_out_id_idx;

alter table public.inventory_out_items drop constraint if exists inventory_out_items_quantity_check;
alter table public.inventory_out_items
  add constraint inventory_out_items_quantity_check check (quantity > 0);

create unique index if not exists inventory_out_items_tenant_wh_sku_key
  on public.inventory_out_items (tenant_id, warehouse_id, product_sku_id);

create index if not exists inventory_out_items_warehouse_id_idx
  on public.inventory_out_items (warehouse_id);

-- Return history.
create table if not exists public.inventory_out_returns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  return_number text not null,
  warehouse_id uuid not null references public.warehouses (id) on delete restrict,
  return_date date not null,
  notes text not null default '',
  status text not null default 'POSTED',
  subtotal numeric(14, 4) not null default 0,
  total numeric(14, 4) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_out_returns_status_check check (status in ('POSTED', 'CANCELLED')),
  constraint inventory_out_returns_tenant_return_number_key unique (tenant_id, return_number)
);

-- Align partial schema from earlier dev-only migrations (40000/50000).
alter table public.inventory_out_returns
  add column if not exists subtotal numeric(14, 4) not null default 0;
alter table public.inventory_out_returns
  add column if not exists total numeric(14, 4) not null default 0;
alter table public.inventory_out_returns drop column if exists inventory_out_id;

create index if not exists inventory_out_returns_tenant_id_idx
  on public.inventory_out_returns (tenant_id);
create index if not exists inventory_out_returns_warehouse_id_idx
  on public.inventory_out_returns (warehouse_id);

create table if not exists public.inventory_out_return_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  inventory_out_return_id uuid not null references public.inventory_out_returns (id) on delete cascade,
  product_sku_id uuid not null references public.product_skus (id) on delete restrict,
  inventory_out_item_id uuid references public.inventory_out_items (id) on delete set null,
  quantity numeric(14, 4) not null,
  unit_cost numeric(14, 4) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_out_return_items_quantity_check check (quantity > 0)
);

alter table public.inventory_out_return_items
  add column if not exists inventory_out_item_id uuid
    references public.inventory_out_items (id) on delete set null;

create index if not exists inventory_out_return_items_tenant_id_idx
  on public.inventory_out_return_items (tenant_id);
create index if not exists inventory_out_return_items_return_id_idx
  on public.inventory_out_return_items (inventory_out_return_id);
create index if not exists inventory_out_return_items_product_sku_id_idx
  on public.inventory_out_return_items (product_sku_id);
