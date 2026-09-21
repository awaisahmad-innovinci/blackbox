-- Pending return vouchers: manager issues PENDING (inventory restored), cashier completes refund.

alter table public.sale_returns
  add column if not exists issued_by uuid references public.users (id) on delete set null,
  add column if not exists issued_by_name text,
  add column if not exists refunded_by uuid references public.users (id) on delete set null,
  add column if not exists refunded_by_name text,
  add column if not exists refunded_at timestamptz,
  add column if not exists applied_to_sale_id uuid references public.sales (id) on delete set null,
  add column if not exists completion_mode text;

update public.sale_returns
set
  issued_by = processed_by,
  issued_by_name = null
where issued_by is null and processed_by is not null;

alter table public.sale_returns
  drop constraint if exists sale_returns_status_check;

update public.sale_returns
set status = 'COMPLETED'
where status = 'POSTED';

alter table public.sale_returns
  add constraint sale_returns_status_check check (status in ('PENDING', 'COMPLETED'));

alter table public.sale_returns
  drop constraint if exists sale_returns_completion_mode_check;

alter table public.sale_returns
  add constraint sale_returns_completion_mode_check check (
    completion_mode is null or completion_mode in ('SALE_OFFSET', 'STANDALONE_CASH')
  );

alter table public.activity_logs
  drop constraint if exists activity_logs_event_type_check;

alter table public.activity_logs
  add constraint activity_logs_event_type_check check (
    event_type in (
      'sale.line_removed',
      'sale.line_qty_adjusted',
      'sale.foc_posted',
      'sale.return_posted',
      'sale.return_issued',
      'sale.return_refunded',
      'till.opened',
      'till.cash_collected',
      'till.limit_reached',
      'till.withdrawn_full',
      'till.reopened',
      'till.closed'
    )
  );

insert into public.permissions (key, description)
values ('sales.refund', 'Complete pending customer return refunds at till')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = 'sales.refund'
where r.key in ('OWNER', 'CASHIER')
on conflict do nothing;
