-- Inventory Out bill: persist subtotal / total on header

alter table public.inventory_outs
  add column if not exists subtotal numeric(14, 4) not null default 0;

alter table public.inventory_outs
  add column if not exists total numeric(14, 4) not null default 0;
