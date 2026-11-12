-- Owner-funded manager drawer floats, and which manager paid a till opening.

create table if not exists public.manager_drawer_openings (
  id uuid primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  manager_user_id uuid not null references public.users (id) on delete restrict,
  manager_name text not null default '',
  amount numeric(14, 4) not null,
  opened_by_user_id uuid not null references public.users (id) on delete restrict,
  opened_by_name text not null default '',
  opened_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists manager_drawer_openings_tenant_id_idx
  on public.manager_drawer_openings (tenant_id);

create index if not exists manager_drawer_openings_manager_idx
  on public.manager_drawer_openings (tenant_id, manager_user_id);

alter table public.till_sessions
  add column if not exists funded_by_user_id uuid references public.users (id) on delete set null;

create index if not exists till_sessions_funded_by_idx
  on public.till_sessions (tenant_id, funded_by_user_id);

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
      'till.closed',
      'sale.posted',
      'purchase_order.created',
      'goods_receipt.posted',
      'inventory_out.posted',
      'inventory_out_return.posted',
      'vendor_return.posted',
      'cash_expense.recorded',
      'drawer.opened'
    )
  );
