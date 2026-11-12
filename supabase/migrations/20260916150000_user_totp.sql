-- Supervisor TOTP (Authy-compatible) for Manager/Owner accounts
create table if not exists user_totp (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  secret_ciphertext text not null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create index if not exists user_totp_tenant_id_idx on user_totp (tenant_id);
create index if not exists user_totp_user_id_idx on user_totp (user_id);
