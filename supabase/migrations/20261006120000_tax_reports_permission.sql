insert into public.permissions (key, description)
values (
  'tax.reports.read',
  'View tax paid and collected reports'
)
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.key in ('OWNER', 'MANAGER')
  and p.key = 'tax.reports.read'
on conflict do nothing;
