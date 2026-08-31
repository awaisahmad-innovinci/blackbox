insert into public.permissions (key, description)
values ('warehouses.write', 'Create, update, and deactivate warehouses')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = 'warehouses.write'
where r.key = 'OWNER'
on conflict do nothing;
