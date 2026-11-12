alter table public.tenants
  add column if not exists default_gst_rate real not null default 0,
  add column if not exists default_sales_tax_rate real not null default 0;

comment on column public.tenants.default_gst_rate is 'Default GST percentage applied to every sale (e.g. 17 = 17%)';
comment on column public.tenants.default_sales_tax_rate is 'Default sales tax percentage applied to every sale';
