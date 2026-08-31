alter table public.goods_receipt_items
  add column if not exists bonus_quantity numeric(14, 4) not null default 0;
