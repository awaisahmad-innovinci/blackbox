alter table public.cash_expenses
  drop constraint if exists cash_expenses_category_check;

alter table public.cash_expenses
  add constraint cash_expenses_category_check check (
    category in ('Rent', 'Electricity', 'Internet', 'Other', 'Bank deposit')
  );
