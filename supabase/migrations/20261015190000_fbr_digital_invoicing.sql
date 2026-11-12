alter table public.product_skus
  add column if not exists hs_code text;

alter table public.sale_lines
  add column if not exists hs_code text;

alter table public.sales
  add column if not exists fbr_invoice_number text,
  add column if not exists fbr_status text not null default 'pending',
  add column if not exists fbr_error text,
  add column if not exists fbr_submitted_at timestamptz,
  add column if not exists fbr_seller_ntn text;

alter table public.tenants
  add column if not exists fbr_environment text not null default 'sandbox',
  add column if not exists fbr_token text,
  add column if not exists fbr_seller_ntn text,
  add column if not exists fbr_seller_province text,
  add column if not exists fbr_seller_address text,
  add column if not exists fbr_scenario_id text not null default 'SN026';

comment on column public.product_skus.hs_code is 'Pakistan HS code, NNNN.NNNN, sent to FBR on each sale line';
comment on column public.sales.fbr_invoice_number is 'Invoice number returned by FBR digital invoicing';
comment on column public.tenants.fbr_token is 'IRIS digital invoicing bearer token; never returned by the API';
