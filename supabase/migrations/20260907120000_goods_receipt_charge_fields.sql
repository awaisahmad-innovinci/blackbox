-- Goods receipt: adv tax, GST, incentive, shelf rent (sale tax stays in tax column)

alter table public.goods_receipts
  add column if not exists adv_tax numeric(14, 4) not null default 0;

alter table public.goods_receipts
  add column if not exists gst numeric(14, 4) not null default 0;

alter table public.goods_receipts
  add column if not exists incentive numeric(14, 4) not null default 0;

alter table public.goods_receipts
  add column if not exists shelf_rent numeric(14, 4) not null default 0;
