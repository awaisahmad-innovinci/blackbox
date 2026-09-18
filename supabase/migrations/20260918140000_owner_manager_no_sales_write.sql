-- POS sale creation (sales.write) is cashier-only; owner/manager view bills and returns.

delete from public.role_permissions rp
using public.roles r, public.permissions p
where rp.role_id = r.id
  and rp.permission_id = p.id
  and r.key in ('OWNER', 'MANAGER')
  and p.key = 'sales.write';
