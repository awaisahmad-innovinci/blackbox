insert into public.permissions (key, description)
values (
  'inventory.opening.write',
  'Record opening warehouse quantity'
)
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.key = 'OWNER'
  and p.key = 'inventory.opening.write'
on conflict do nothing;
