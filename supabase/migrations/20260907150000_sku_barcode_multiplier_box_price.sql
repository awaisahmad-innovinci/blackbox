-- Phase B/C: barcode qty multiplier + optional box selling price (non-breaking defaults)

alter table product_sku_barcodes
  add column if not exists quantity_multiplier numeric not null default 1;

alter table product_sku_barcodes
  drop constraint if exists product_sku_barcodes_quantity_multiplier_check;

alter table product_sku_barcodes
  add constraint product_sku_barcodes_quantity_multiplier_check
  check (quantity_multiplier > 0);

update product_sku_barcodes
set quantity_multiplier = 1
where quantity_multiplier is null;

alter table product_skus
  add column if not exists selling_price_per_purchase_unit numeric null;
