-- Cash amount received from customer (for receipt change line; nullable for card/credit).

alter table public.sales
  add column if not exists cash_tendered numeric(14, 4);

comment on column public.sales.cash_tendered is 'Cash received from customer at POS; used for change on thermal receipt';
