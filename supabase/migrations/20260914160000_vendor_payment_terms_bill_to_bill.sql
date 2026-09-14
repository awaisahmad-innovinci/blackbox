alter table public.vendors drop constraint if exists vendors_payment_terms_check;

alter table public.vendors
  add constraint vendors_payment_terms_check
  check (
    payment_terms is null
    or payment_terms in (
      'CASH', '7_DAYS', '15_DAYS', '30_DAYS', '45_DAYS', 'BILL_TO_BILL', 'CUSTOM'
    )
  );
