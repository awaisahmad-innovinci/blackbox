-- One shared role catalog. A role key exists once and is assigned in every tenant.

create temp table role_canonical as
select distinct on (key)
  id as canonical_id,
  key
from public.roles
order by key, updated_at desc, created_at asc, id asc;

alter table public.user_roles
  drop constraint if exists user_roles_tenant_role_fk;

delete from public.user_roles ur
using public.roles r
join role_canonical c on c.key = r.key
where ur.role_id = r.id
  and r.id <> c.canonical_id
  and exists (
    select 1
    from public.user_roles keep
    where keep.user_id = ur.user_id
      and keep.role_id = c.canonical_id
  );

update public.user_roles ur
set role_id = c.canonical_id
from public.roles r
join role_canonical c on c.key = r.key
where ur.role_id = r.id
  and r.id <> c.canonical_id;

delete from public.roles r
using role_canonical c
where r.key = c.key
  and r.id <> c.canonical_id;

drop index if exists public.roles_tenant_id_idx;

alter table public.roles
  drop constraint if exists roles_tenant_id_key_key;

alter table public.roles
  drop constraint if exists roles_tenant_id_id_key;

alter table public.roles
  drop column if exists tenant_id;

alter table public.roles
  add constraint roles_key_key unique (key);

alter table public.user_roles
  add constraint user_roles_role_id_fkey
  foreign key (role_id) references public.roles (id) on delete cascade;

comment on table public.roles is 'Shared roles. is_system marks OWNER, MANAGER, and the other default keys.';

insert into public.roles (key, name, is_system)
values
  ('OWNER', 'Owner', true),
  ('MANAGER', 'Manager', true),
  ('WAREHOUSE_MANAGER', 'Warehouse Manager', true),
  ('CASHIER', 'Cashier', true),
  ('CASHIER_NON_FBR', 'Cashier (Non-FBR)', true)
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key not in ('sales.write', 'sales.non_fbr')
where r.key = 'OWNER'
  and not exists (
    select 1 from public.role_permissions existing where existing.role_id = r.id
  )
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = any (array[
  'desktop.access',
  'sync.use',
  'sales.read',
  'sales.void',
  'sales.return',
  'till.read',
  'till.manage',
  'activity.read',
  'tax.reports.read'
])
where r.key = 'MANAGER'
  and not exists (
    select 1 from public.role_permissions existing where existing.role_id = r.id
  )
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = any (array[
  'desktop.access',
  'sync.use',
  'warehouses.read',
  'warehouses.write',
  'inventory.access',
  'purchasing.access',
  'vendors.access'
])
where r.key = 'WAREHOUSE_MANAGER'
  and not exists (
    select 1 from public.role_permissions existing where existing.role_id = r.id
  )
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = any (array[
  'desktop.access',
  'sync.use',
  'sales.write',
  'sales.refund',
  'till.read'
])
where r.key = 'CASHIER'
  and not exists (
    select 1 from public.role_permissions existing where existing.role_id = r.id
  )
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = any (array[
  'desktop.access',
  'sync.use',
  'sales.write',
  'sales.refund',
  'till.read',
  'sales.non_fbr'
])
where r.key = 'CASHIER_NON_FBR'
  and not exists (
    select 1 from public.role_permissions existing where existing.role_id = r.id
  )
on conflict do nothing;
