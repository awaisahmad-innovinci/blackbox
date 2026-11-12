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
      'cash_expense.recorded'
    )
  );
