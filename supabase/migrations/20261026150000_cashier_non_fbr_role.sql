insert into public.permissions (key, description)
values (
  'sales.non_fbr',
  'Post sales as simple bills that are not sent to FBR'
)
on conflict (key) do nothing;

insert into public.roles (tenant_id, key, name, is_system)
select t.id, 'CASHIER_NON_FBR', 'Cashier (Non-FBR)', true
from public.tenants t
where not exists (
  select 1
  from public.roles r
  where r.tenant_id = t.id
    and r.key = 'CASHIER_NON_FBR'
);

insert into public.role_permissions (role_id, permission_id)
select new_role.id, rp.permission_id
from public.roles new_role
join public.roles cashier
  on cashier.tenant_id = new_role.tenant_id
 and cashier.key = 'CASHIER'
join public.role_permissions rp on rp.role_id = cashier.id
where new_role.key = 'CASHIER_NON_FBR'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = 'sales.non_fbr'
where r.key = 'CASHIER_NON_FBR'
on conflict do nothing;
