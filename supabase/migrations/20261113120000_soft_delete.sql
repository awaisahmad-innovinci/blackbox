-- Soft delete: deleted rows stay for history but are hidden from lists and pickers.

alter table public.brands add column if not exists deleted_at timestamptz;
alter table public.categories add column if not exists deleted_at timestamptz;
alter table public.vendor_groups add column if not exists deleted_at timestamptz;
alter table public.warehouses add column if not exists deleted_at timestamptz;
alter table public.products add column if not exists deleted_at timestamptz;
alter table public.product_skus add column if not exists deleted_at timestamptz;
alter table public.vendors add column if not exists deleted_at timestamptz;
alter table public.users add column if not exists deleted_at timestamptz;
alter table public.devices add column if not exists deleted_at timestamptz;

create index if not exists products_tenant_live_idx
  on public.products (tenant_id) where deleted_at is null;
create index if not exists product_skus_tenant_live_idx
  on public.product_skus (tenant_id) where deleted_at is null;
create index if not exists vendors_tenant_live_idx
  on public.vendors (tenant_id) where deleted_at is null;
