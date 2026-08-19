-- Stable identity for idempotent product CSV imports.
alter table public.products
  add column if not exists import_key text;

create unique index if not exists products_tenant_id_import_key_key
  on public.products (tenant_id, import_key);
