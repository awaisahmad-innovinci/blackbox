-- Receipt fields: customer name and cashier display name on POS sales.

alter table public.sales
  add column if not exists customer_name text not null default 'CASH SALES CUSTOMER',
  add column if not exists posted_by_name text;

comment on column public.sales.customer_name is 'Customer on the receipt; defaults to walk-in cash sales';
comment on column public.sales.posted_by_name is 'Cashier full name snapshot at post time for reprints';
