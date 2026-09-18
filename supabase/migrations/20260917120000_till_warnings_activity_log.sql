-- Till warnings follow-up: activity log, partial cash collection, withdraw approval setting.

alter table public.tenants
  add column if not exists require_manager_approval_till_withdraw boolean not null default true;

alter table public.till_withdrawals
  add column if not exists kind text not null default 'full';

alter table public.till_withdrawals
  drop constraint if exists till_withdrawals_kind_check;

alter table public.till_withdrawals
  add constraint till_withdrawals_kind_check check (kind in ('partial', 'full'));

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  event_type text not null,
  actor_user_id uuid not null references public.users (id) on delete restrict,
  supervisor_user_id uuid references public.users (id) on delete set null,
  subject_user_id uuid references public.users (id) on delete set null,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint activity_logs_event_type_check check (
    event_type in (
      'sale.line_removed',
      'till.opened',
      'till.cash_collected',
      'till.limit_reached',
      'till.withdrawn_full',
      'till.reopened'
    )
  )
);

create index if not exists activity_logs_tenant_id_idx on public.activity_logs (tenant_id);
create index if not exists activity_logs_created_at_idx on public.activity_logs (created_at desc);
create index if not exists activity_logs_event_type_idx on public.activity_logs (event_type);

insert into public.permissions (key, description)
values ('activity.read', 'View POS activity and approval log')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = 'activity.read'
where r.key in ('OWNER', 'MANAGER')
on conflict do nothing;
