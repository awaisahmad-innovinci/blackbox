alter table public.product_skus
  add column if not exists sale_discount_percent numeric(8, 4) not null default 0;

alter table public.sale_lines
  add column if not exists discount_percent numeric(8, 4) not null default 0,
  add column if not exists foc_quantity numeric(14, 4) not null default 0;

comment on column public.product_skus.sale_discount_percent is 'Default POS line discount % for this SKU';
comment on column public.sale_lines.discount_percent is 'Line discount % snapshot at sale time';
comment on column public.sale_lines.foc_quantity is 'Free-of-cost whole units (inventory only, not billed)';
