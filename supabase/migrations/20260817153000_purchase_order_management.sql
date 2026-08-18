-- Purchase order management: other_charges + line purchase-unit snapshots

alter table public.purchase_orders
  add column if not exists other_charges numeric(14, 4) not null default 0;

alter table public.purchase_order_items
  add column if not exists purchase_unit_id uuid references public.units (id) on delete set null;

alter table public.purchase_order_items
  add column if not exists units_per_purchase_unit numeric(14, 4) not null default 1;

create index if not exists purchase_order_items_purchase_unit_id_idx
  on public.purchase_order_items (purchase_unit_id);

-- Backfill purchase unit snapshot from vendor_skus where linked
update public.purchase_order_items poi
set
  purchase_unit_id = coalesce(poi.purchase_unit_id, vs.purchase_unit_id),
  units_per_purchase_unit = coalesce(
    nullif(poi.units_per_purchase_unit, 0),
    vs.units_per_purchase_unit,
    1
  )
from public.vendor_skus vs
where poi.vendor_sku_id = vs.id
  and (poi.purchase_unit_id is null or poi.units_per_purchase_unit = 1);
