alter table public.vendor_ledger_entries
  add column if not exists payment_method text,
  add column if not exists reference_number text;

alter table public.vendor_ledger_entries
  drop constraint if exists vendor_ledger_entries_payment_method_check;

alter table public.vendor_ledger_entries
  add constraint vendor_ledger_entries_payment_method_check
  check (payment_method is null or payment_method in ('CASH', 'BANK'));

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = 'vendors.access'
where r.key = 'MANAGER'
on conflict do nothing;

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
      'drawer.submitted',
      'vendor.paid',
      'auth.login',
      'auth.logout'
    )
  );
