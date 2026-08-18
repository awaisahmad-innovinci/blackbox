-- Product / inventory management: product_code, product_type, SKU purchase defaults & stock levels

-- products: product_code + product_type
alter table public.products
  add column if not exists product_code text;

alter table public.products
  add column if not exists product_type text not null default 'STOCK_ITEM';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'products_product_type_check'
  ) then
    alter table public.products
      add constraint products_product_type_check
      check (product_type in ('STOCK_ITEM', 'CONSUMABLE', 'RESALABLE'));
  end if;
end $$;

-- Backfill known Demo Store seed products
update public.products set product_code = 'PRD-001', product_type = 'STOCK_ITEM'
where id = 'c1000000-0000-4000-8000-000000000001' and (product_code is null or product_code = '');

update public.products set product_code = 'PRD-002', product_type = 'STOCK_ITEM'
where id = 'c1000000-0000-4000-8000-000000000002' and (product_code is null or product_code = '');

update public.products set product_code = 'PRD-003', product_type = 'STOCK_ITEM'
where id = 'c1000000-0000-4000-8000-000000000003' and (product_code is null or product_code = '');

-- Remaining rows: sequential codes from name slug fallback
with numbered as (
  select
    id,
    'PRD-' || lpad(
      (row_number() over (partition by tenant_id order by created_at, id) + 100)::text,
      3,
      '0'
    ) as code
  from public.products
  where product_code is null or product_code = ''
)
update public.products p
set product_code = n.code
from numbered n
where p.id = n.id;

alter table public.products
  alter column product_code set not null;

create unique index if not exists products_tenant_id_product_code_key
  on public.products (tenant_id, product_code);

-- product_skus: purchase packaging defaults + min/max stock
alter table public.product_skus
  add column if not exists purchase_unit_id uuid references public.units (id) on delete set null;

alter table public.product_skus
  add column if not exists units_per_purchase_unit numeric(14, 4) not null default 1;

alter table public.product_skus
  add column if not exists minimum_stock_level numeric(14, 4) not null default 0;

alter table public.product_skus
  add column if not exists maximum_stock_level numeric(14, 4);

create index if not exists product_skus_purchase_unit_id_idx
  on public.product_skus (purchase_unit_id);
