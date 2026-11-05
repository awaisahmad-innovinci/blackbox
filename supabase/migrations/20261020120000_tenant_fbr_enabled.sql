alter table public.tenants
  add column if not exists fbr_enabled boolean not null default false;

comment on column public.tenants.fbr_enabled is 'When false, sales are not submitted to FBR and bills omit the FBR line';
