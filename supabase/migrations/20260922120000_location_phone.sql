-- Optional store contact phone for receipt header.

alter table public.locations
  add column if not exists phone text;

comment on column public.locations.phone is 'Store contact phone shown on thermal receipts when set';
