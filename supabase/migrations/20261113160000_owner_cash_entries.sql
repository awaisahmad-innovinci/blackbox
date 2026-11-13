-- Cash the owner adds to the running owner drawer.

create table if not exists public.owner_cash_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  recorded_by_user_id uuid not null references public.users (id) on delete restrict,
  recorded_by_name text not null default '',
  amount numeric(14, 4) not null,
  note text not null default '',
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint owner_cash_entries_amount_check check (amount > 0)
);

create index if not exists owner_cash_entries_tenant_id_idx
  on public.owner_cash_entries (tenant_id);
create index if not exists owner_cash_entries_recorded_by_idx
  on public.owner_cash_entries (tenant_id, recorded_by_user_id);
