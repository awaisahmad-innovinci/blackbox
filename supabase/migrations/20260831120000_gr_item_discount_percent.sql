alter table public.goods_receipt_items
  add column if not exists discount_percent numeric(8, 4) not null default 0;
