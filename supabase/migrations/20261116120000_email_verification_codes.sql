-- One-time codes that prove an owner email can receive mail before a tenant exists.

create table public.email_verification_codes (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index email_verification_codes_email_idx
  on public.email_verification_codes (email);

create index email_verification_codes_expires_at_idx
  on public.email_verification_codes (expires_at);

comment on table public.email_verification_codes is
  'Hashed OTP codes that confirm an owner mailbox before tenant creation';
