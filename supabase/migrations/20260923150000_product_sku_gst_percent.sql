alter table public.product_skus
  add column if not exists gst_percent numeric(8,4) not null default 0;
