-- Allow sale.foc_posted activity log events (manager-approved FOC sale post).

alter table public.activity_logs
  drop constraint if exists activity_logs_event_type_check;

alter table public.activity_logs
  add constraint activity_logs_event_type_check check (
    event_type in (
      'sale.line_removed',
      'sale.foc_posted',
      'till.opened',
      'till.cash_collected',
      'till.limit_reached',
      'till.withdrawn_full',
      'till.reopened',
      'till.closed'
    )
  );
