-- Short register code (C1, C2, …) for device-scoped document numbers offline.

alter table public.devices
  add column if not exists code text;

-- Backfill existing POS devices in registration order per tenant.
with numbered as (
  select
    id,
    row_number() over (
      partition by tenant_id
      order by created_at asc, id asc
    ) as rn
  from public.devices
  where code is null
    and fingerprint != 'cloud-hub'
)
update public.devices d
set code = 'C' || numbered.rn::text
from numbered
where d.id = numbered.id;

create unique index if not exists devices_tenant_id_code_key
  on public.devices (tenant_id, code)
  where code is not null;
