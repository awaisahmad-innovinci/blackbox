-- Vendor return line quantity is stored in base units (pieces), not purchase units.

update public.vendor_return_items
set quantity = quantity * units_per_purchase_unit
where units_per_purchase_unit > 0;
