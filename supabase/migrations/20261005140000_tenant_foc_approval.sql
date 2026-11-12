-- Manager Authy before posting a sale that includes FOC lines.

alter table public.tenants
  add column if not exists require_manager_approval_foc boolean not null default true;
