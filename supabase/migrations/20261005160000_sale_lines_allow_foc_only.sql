-- Allow FOC-only sale lines: quantity 0 with foc_quantity > 0.
-- Such lines are not billed (line_total 0) but FOC units are still
-- deducted from the POS floor balance.
alter table public.sale_lines
  drop constraint if exists sale_lines_quantity_check;

alter table public.sale_lines
  add constraint sale_lines_quantity_check
  check (quantity >= 0 and (quantity > 0 or foc_quantity > 0));
