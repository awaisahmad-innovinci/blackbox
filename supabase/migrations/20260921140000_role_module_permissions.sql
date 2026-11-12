-- Module access permissions for role-based desktop nav (warehouse manager vs manager).

insert into public.permissions (key, description)
values
  ('warehouses.read', 'View warehouses'),
  (
    'inventory.access',
    'Access inventory module (products, brands, stock movements, reports)'
  ),
  (
    'purchasing.access',
    'Access purchasing module (purchase orders, goods receipts)'
  ),
  ('vendors.access', 'Access vendors module (vendors and vendor groups)')
on conflict (key) do nothing;

-- Owner: all new module keys (warehouses.write already granted separately).
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.key = 'OWNER'
  and p.key in (
    'warehouses.read',
    'inventory.access',
    'purchasing.access',
    'vendors.access'
  )
on conflict do nothing;

-- Warehouse manager: full inventory module on desktop.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.key = 'WAREHOUSE_MANAGER'
  and p.key in (
    'warehouses.read',
    'warehouses.write',
    'inventory.access',
    'purchasing.access',
    'vendors.access'
  )
on conflict do nothing;

-- Manager: sales supervision only — drop admin, settings, and inventory keys.
delete from public.role_permissions rp
using public.roles r, public.permissions p
where rp.role_id = r.id
  and rp.permission_id = p.id
  and r.key = 'MANAGER'
  and p.key in (
    'users.read',
    'users.write',
    'roles.read',
    'permissions.read',
    'devices.read',
    'tenant.settings.read',
    'warehouses.write',
    'warehouses.read',
    'inventory.access',
    'purchasing.access',
    'vendors.access',
    'web.access'
  );

-- Web admin is owner-only: strip web.access from other system roles if present.
delete from public.role_permissions rp
using public.roles r, public.permissions p
where rp.role_id = r.id
  and rp.permission_id = p.id
  and r.key in ('MANAGER', 'WAREHOUSE_MANAGER', 'CASHIER')
  and p.key = 'web.access';
