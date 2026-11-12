-- Cash a manager hands to the owner at day end.

create table if not exists public.manager_drawer_submissions (
  id uuid primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  manager_user_id uuid not null references public.users (id) on delete restrict,
  manager_name text not null default '',
  amount numeric(14, 4) not null,
  submitted_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists manager_drawer_submissions_tenant_id_idx
  on public.manager_drawer_submissions (tenant_id);

create index if not exists manager_drawer_submissions_manager_idx
  on public.manager_drawer_submissions (tenant_id, manager_user_id);

create index if not exists manager_drawer_submissions_submitted_at_idx
  on public.manager_drawer_submissions (tenant_id, submitted_at);

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
      'drawer.opened',
      'drawer.submitted'
    )
  );
