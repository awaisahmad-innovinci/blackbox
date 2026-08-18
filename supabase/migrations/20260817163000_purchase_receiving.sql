-- Purchase receiving: goods receipt totals, voucher, vendor + line cost/unit snapshots

alter table public.goods_receipts
  add column if not exists vendor_id uuid references public.vendors (id) on delete set null;

alter table public.goods_receipts
  add column if not exists voucher_number text;

alter table public.goods_receipts
  add column if not exists subtotal numeric(14, 4) not null default 0;

alter table public.goods_receipts
  add column if not exists discount numeric(14, 4) not null default 0;

alter table public.goods_receipts
  add column if not exists tax numeric(14, 4) not null default 0;

alter table public.goods_receipts
  add column if not exists other_charges numeric(14, 4) not null default 0;

alter table public.goods_receipts
  add column if not exists total numeric(14, 4) not null default 0;

create index if not exists goods_receipts_vendor_id_idx
  on public.goods_receipts (vendor_id);

-- Backfill vendor_id from purchase orders where missing
update public.goods_receipts gr
set vendor_id = po.vendor_id
from public.purchase_orders po
where gr.purchase_order_id = po.id
  and gr.vendor_id is null;

alter table public.goods_receipt_items
  add column if not exists vendor_sku_id uuid references public.vendor_skus (id) on delete set null;

alter table public.goods_receipt_items
  add column if not exists purchase_unit_id uuid references public.units (id) on delete set null;

alter table public.goods_receipt_items
  add column if not exists units_per_purchase_unit numeric(14, 4) not null default 1;

alter table public.goods_receipt_items
  add column if not exists po_unit_cost numeric(14, 4) not null default 0;

alter table public.goods_receipt_items
  add column if not exists receiving_unit_cost numeric(14, 4) not null default 0;

alter table public.goods_receipt_items
  add column if not exists line_total numeric(14, 4) not null default 0;

-- Backfill from purchase_order_items where linked
update public.goods_receipt_items gri
set
  vendor_sku_id = coalesce(gri.vendor_sku_id, poi.vendor_sku_id),
  purchase_unit_id = coalesce(gri.purchase_unit_id, poi.purchase_unit_id),
  units_per_purchase_unit = coalesce(nullif(gri.units_per_purchase_unit, 0), poi.units_per_purchase_unit, 1),
  po_unit_cost = coalesce(nullif(gri.po_unit_cost, 0), poi.unit_cost, 0),
  receiving_unit_cost = coalesce(nullif(gri.receiving_unit_cost, 0), poi.unit_cost, 0),
  line_total = coalesce(
    nullif(gri.line_total, 0),
    round(gri.received_quantity * coalesce(nullif(poi.unit_cost, 0), 0), 4)
  )
from public.purchase_order_items poi
where gri.purchase_order_item_id = poi.id;
