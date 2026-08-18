-- Vendor management: groups, contacts, commercial fields on vendors.
-- Demo Store tenant: a0000000-0000-4000-8000-000000000001

-- ---------------------------------------------------------------------------
-- vendor_groups
-- ---------------------------------------------------------------------------
create table if not exists public.vendor_groups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  description text not null default '',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vendor_groups_status_check check (status in ('active', 'inactive')),
  constraint vendor_groups_tenant_id_name_key unique (tenant_id, name)
);
create index if not exists vendor_groups_tenant_id_idx on public.vendor_groups (tenant_id);

-- ---------------------------------------------------------------------------
-- Seed groups for Demo Store
-- ---------------------------------------------------------------------------
insert into public.vendor_groups (id, tenant_id, name, description) values
  ('a1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Beverage Distributor', 'Beverage distribution'),
  ('a1000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'Grocery Supplier', 'Grocery staples'),
  ('a1000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'Wholesale', 'General wholesale'),
  ('a1000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'Manufacturer', 'Direct manufacturer'),
  ('a1000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000001', 'Local Supplier', 'Local / regional suppliers')
on conflict (tenant_id, name) do nothing;

-- ---------------------------------------------------------------------------
-- Alter vendors: commercial + group + address extras
-- ---------------------------------------------------------------------------
alter table public.vendors
  add column if not exists group_id uuid references public.vendor_groups (id) on delete set null,
  add column if not exists state text,
  add column if not exists postal_code text,
  add column if not exists sales_target numeric(14, 4),
  add column if not exists credit_limit numeric(14, 4),
  add column if not exists payment_terms text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'vendors_payment_terms_check'
  ) then
    alter table public.vendors
      add constraint vendors_payment_terms_check
      check (
        payment_terms is null
        or payment_terms in ('CASH', '7_DAYS', '15_DAYS', '30_DAYS', '45_DAYS', 'CUSTOM')
      );
  end if;
end $$;

create index if not exists vendors_group_id_idx on public.vendors (group_id);

-- Assign groups to seeded Demo Store vendors
update public.vendors
set group_id = 'a1000000-0000-4000-8000-000000000001'
where tenant_id = 'a0000000-0000-4000-8000-000000000001'
  and vendor_code = 'ABC'
  and group_id is null;

update public.vendors
set group_id = 'a1000000-0000-4000-8000-000000000003'
where tenant_id = 'a0000000-0000-4000-8000-000000000001'
  and vendor_code = 'XYZ'
  and group_id is null;

update public.vendors
set group_id = 'a1000000-0000-4000-8000-000000000001'
where tenant_id = 'a0000000-0000-4000-8000-000000000001'
  and vendor_code = 'NAT'
  and group_id is null;

-- ---------------------------------------------------------------------------
-- vendor_contacts
-- ---------------------------------------------------------------------------
create table if not exists public.vendor_contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  vendor_id uuid not null references public.vendors (id) on delete cascade,
  contact_type text not null,
  name text,
  phone text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vendor_contacts_type_check check (
    contact_type in ('PRIMARY', 'OTHER', 'MANAGER', 'SALESPERSON')
  ),
  constraint vendor_contacts_tenant_vendor_type_key unique (tenant_id, vendor_id, contact_type)
);
create index if not exists vendor_contacts_tenant_id_idx on public.vendor_contacts (tenant_id);
create index if not exists vendor_contacts_vendor_id_idx on public.vendor_contacts (vendor_id);

-- Migrate legacy inline contacts → PRIMARY rows
insert into public.vendor_contacts (tenant_id, vendor_id, contact_type, name, phone, email)
select
  v.tenant_id,
  v.id,
  'PRIMARY',
  nullif(trim(v.contact_person), ''),
  nullif(trim(v.phone), ''),
  nullif(trim(v.email), '')
from public.vendors v
where (
  coalesce(nullif(trim(v.contact_person), ''), '') <> ''
  or coalesce(nullif(trim(v.phone), ''), '') <> ''
  or coalesce(nullif(trim(v.email), ''), '') <> ''
)
on conflict (tenant_id, vendor_id, contact_type) do nothing;

-- Drop legacy contact columns
alter table public.vendors
  drop column if exists contact_person,
  drop column if exists phone,
  drop column if exists email;
