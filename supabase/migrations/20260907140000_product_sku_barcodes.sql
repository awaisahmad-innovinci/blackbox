-- Multiple barcodes per SKU (tenant-wide unique barcode)

create table if not exists public.product_sku_barcodes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  product_sku_id uuid not null references public.product_skus (id) on delete cascade,
  barcode text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_sku_barcodes_status_check check (status in ('active', 'inactive')),
  constraint product_sku_barcodes_tenant_barcode_key unique (tenant_id, barcode)
);

create index if not exists product_sku_barcodes_sku_id_idx
  on public.product_sku_barcodes (product_sku_id);

insert into public.product_sku_barcodes (tenant_id, product_sku_id, barcode, status)
select tenant_id, id, barcode, 'active'
from public.product_skus
where barcode is not null and trim(barcode) != ''
on conflict (tenant_id, barcode) do nothing;

alter table public.product_skus
  drop constraint if exists product_skus_tenant_id_barcode_key;
