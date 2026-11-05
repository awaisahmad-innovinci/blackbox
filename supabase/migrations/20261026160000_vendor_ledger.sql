alter table public.goods_receipts
  add column if not exists amount_paid numeric(14, 4) not null default 0;

update public.goods_receipts
set amount_paid = total
where amount_paid = 0;

create table if not exists public.vendor_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  vendor_id uuid not null references public.vendors (id) on delete restrict,
  entry_type text not null check (entry_type in ('CHARGE', 'PAYMENT')),
  amount numeric(14, 4) not null check (amount > 0),
  goods_receipt_id uuid references public.goods_receipts (id) on delete set null,
  receipt_number text,
  note text not null default '',
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vendor_ledger_entries_tenant_vendor_idx
  on public.vendor_ledger_entries (tenant_id, vendor_id);

create index if not exists vendor_ledger_entries_goods_receipt_id_idx
  on public.vendor_ledger_entries (goods_receipt_id);
