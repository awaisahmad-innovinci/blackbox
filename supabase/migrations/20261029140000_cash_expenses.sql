-- Manager drawer expenses. Each row reduces the recording manager's drawer.

create table if not exists public.cash_expenses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  recorded_by_user_id uuid not null references public.users (id) on delete restrict,
  recorded_by_name text not null default '',
  category text not null,
  amount numeric(14, 4) not null,
  note text not null default '',
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cash_expenses_category_check check (
    category in ('Rent', 'Electricity', 'Internet', 'Other')
  ),
  constraint cash_expenses_amount_check check (amount > 0)
);

create index if not exists cash_expenses_tenant_id_idx
  on public.cash_expenses (tenant_id);
create index if not exists cash_expenses_recorded_by_idx
  on public.cash_expenses (tenant_id, recorded_by_user_id);
create index if not exists cash_expenses_occurred_at_idx
  on public.cash_expenses (tenant_id, occurred_at);
