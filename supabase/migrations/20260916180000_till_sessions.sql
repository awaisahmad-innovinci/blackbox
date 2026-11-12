-- Cash till sessions, withdrawals, permissions, and tenant approval toggle.

alter table public.tenants
  add column if not exists require_manager_approval_till_open boolean not null default true;

create table if not exists public.till_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  status text not null default 'PENDING_APPROVAL',
  note_10 integer not null default 0,
  note_20 integer not null default 0,
  note_50 integer not null default 0,
  note_100 integer not null default 0,
  note_500 integer not null default 0,
  note_1000 integer not null default 0,
  note_5000 integer not null default 0,
  opening_total numeric(14, 4) not null default 0,
  opening_balance numeric(14, 4) not null default 0,
  current_cash_balance numeric(14, 4) not null default 0,
  max_cash_limit numeric(14, 4) not null default 0,
  opened_at timestamptz,
  closed_at timestamptz,
  approved_by_user_id uuid references public.users (id) on delete set null,
  approved_at timestamptz,
  reopened_by_user_id uuid references public.users (id) on delete set null,
  close_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint till_sessions_status_check check (
    status in ('PENDING_APPROVAL', 'OPEN', 'CLOSED_LIMIT', 'CLOSED')
  ),
  constraint till_sessions_note_10_check check (note_10 >= 0),
  constraint till_sessions_note_20_check check (note_20 >= 0),
  constraint till_sessions_note_50_check check (note_50 >= 0),
  constraint till_sessions_note_100_check check (note_100 >= 0),
  constraint till_sessions_note_500_check check (note_500 >= 0),
  constraint till_sessions_note_1000_check check (note_1000 >= 0),
  constraint till_sessions_note_5000_check check (note_5000 >= 0)
);

create index if not exists till_sessions_tenant_id_idx on public.till_sessions (tenant_id);
create index if not exists till_sessions_user_id_idx on public.till_sessions (user_id);
create index if not exists till_sessions_status_idx on public.till_sessions (status);

create unique index if not exists till_sessions_active_user_idx
  on public.till_sessions (tenant_id, user_id)
  where status in ('PENDING_APPROVAL', 'OPEN', 'CLOSED_LIMIT');

create table if not exists public.till_withdrawals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  till_session_id uuid not null references public.till_sessions (id) on delete cascade,
  withdrawn_by_user_id uuid not null references public.users (id) on delete restrict,
  note_10 integer not null default 0,
  note_20 integer not null default 0,
  note_50 integer not null default 0,
  note_100 integer not null default 0,
  note_500 integer not null default 0,
  note_1000 integer not null default 0,
  note_5000 integer not null default 0,
  withdrawal_total numeric(14, 4) not null default 0,
  created_at timestamptz not null default now(),
  constraint till_withdrawals_note_10_check check (note_10 >= 0),
  constraint till_withdrawals_note_20_check check (note_20 >= 0),
  constraint till_withdrawals_note_50_check check (note_50 >= 0),
  constraint till_withdrawals_note_100_check check (note_100 >= 0),
  constraint till_withdrawals_note_500_check check (note_500 >= 0),
  constraint till_withdrawals_note_1000_check check (note_1000 >= 0),
  constraint till_withdrawals_note_5000_check check (note_5000 >= 0)
);

create index if not exists till_withdrawals_tenant_id_idx on public.till_withdrawals (tenant_id);
create index if not exists till_withdrawals_till_session_id_idx on public.till_withdrawals (till_session_id);

insert into public.permissions (key, description)
values
  ('till.read', 'View own cash till session'),
  ('till.manage', 'Approve, withdraw, and reopen cashier tills')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in ('till.read', 'till.manage')
where r.key in ('OWNER', 'MANAGER')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = 'till.read'
where r.key = 'CASHIER'
on conflict do nothing;

delete from public.role_permissions rp
using public.roles r, public.permissions p
where rp.role_id = r.id
  and rp.permission_id = p.id
  and r.key = 'CASHIER'
  and p.key = 'sales.read';
