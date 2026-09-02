-- Owner password reset OTP codes (Nest auth; not Supabase Auth).

create table public.password_reset_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index password_reset_codes_user_id_idx
  on public.password_reset_codes (user_id);

create index password_reset_codes_expires_at_idx
  on public.password_reset_codes (expires_at);

comment on table public.password_reset_codes is
  'Hashed OTP codes for owner forgot-password flow';
