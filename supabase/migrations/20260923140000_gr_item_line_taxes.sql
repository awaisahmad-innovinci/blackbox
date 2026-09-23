-- Per-line absolute tax amounts on goods receipt items (PO receiving).

alter table public.goods_receipt_items
  add column if not exists sale_tax numeric(14, 4) not null default 0,
  add column if not exists adv_tax numeric(14, 4) not null default 0,
  add column if not exists gst numeric(14, 4) not null default 0;
