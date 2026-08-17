-- Phase 1 onboarding: business profile fields on tenants + first location.

alter table public.tenants
  add column if not exists business_type text,
  add column if not exists country text,
  add column if not exists currency text,
  add column if not exists onboarding_completed_at timestamptz;

alter table public.tenants
  drop constraint if exists tenants_business_type_check;

alter table public.tenants
  add constraint tenants_business_type_check
  check (
    business_type is null
    or business_type in ('RETAIL_LIGHT', 'HYPER_MART')
  );

comment on column public.tenants.business_type is 'Onboarding business type: RETAIL_LIGHT | HYPER_MART';
comment on column public.tenants.country is 'ISO-like country code from curated onboarding list';
comment on column public.tenants.currency is 'ISO-like currency code from curated onboarding list';
comment on column public.tenants.onboarding_completed_at is 'Set when onboarding location step is confirmed; null means incomplete';

-- ---------------------------------------------------------------------------
-- locations (tenant-scoped; Phase 1 creates one during onboarding)
-- ---------------------------------------------------------------------------
create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  city text not null,
  address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.locations is 'Tenant locations / store sites; first row created during web onboarding';

create index if not exists locations_tenant_id_idx on public.locations (tenant_id);
