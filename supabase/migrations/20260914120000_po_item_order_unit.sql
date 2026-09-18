-- Per-line box/pc ordering on purchase order items.
alter table public.purchase_order_items
  add column if not exists order_unit text not null default 'box'
  check (order_unit in ('pc', 'box'));

comment on column public.purchase_order_items.order_unit is
  'How the line was entered: pc (base unit) or box (purchase unit). quantity/unit_cost remain purchase-unit canonical.';
