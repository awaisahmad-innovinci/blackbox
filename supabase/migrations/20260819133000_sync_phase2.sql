-- Phase 2 bidirectional incremental sync: catalog permission, change log, conflicts, device health.

insert into public.permissions (key, description)
values ('sync.use', 'Push and pull incremental desktop sync')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = 'sync.use'
where r.key in ('OWNER', 'MANAGER', 'WAREHOUSE_MANAGER', 'CASHIER')
on conflict do nothing;

insert into public.devices (tenant_id, fingerprint, name, status, trusted_at)
select t.id, 'cloud-hub', 'Cloud hub', 'trusted', now()
from public.tenants t
on conflict (tenant_id, fingerprint) do nothing;

alter table public.devices
  add column if not exists last_sync_at timestamptz;

alter table public.devices
  add column if not exists last_sync_error text;

alter table public.devices
  add column if not exists needs_full_resync boolean not null default false;

create table if not exists public.sync_changes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  seq bigint not null,
  change_id uuid not null,
  origin_device_id uuid not null,
  stream text not null,
  entity_type text not null,
  entity_id uuid not null,
  operation text not null,
  entity_version integer not null default 1,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  constraint sync_changes_tenant_seq_key unique (tenant_id, seq),
  constraint sync_changes_tenant_change_id_key unique (tenant_id, change_id),
  constraint sync_changes_operation_check
    check (operation in ('UPSERT', 'DELETE', 'EVENT')),
  constraint sync_changes_stream_nonempty check (length(trim(stream)) > 0),
  constraint sync_changes_tenant_device_fk
    foreign key (tenant_id, origin_device_id)
    references public.devices (tenant_id, id) on delete restrict
);

create index if not exists sync_changes_tenant_stream_seq_idx
  on public.sync_changes (tenant_id, stream, seq);

create index if not exists sync_changes_tenant_origin_seq_idx
  on public.sync_changes (tenant_id, origin_device_id, seq);

create table if not exists public.sync_conflicts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  device_id uuid not null,
  stream text not null,
  entity_type text not null,
  entity_id uuid not null,
  local_change_id uuid not null,
  cloud_change_id uuid,
  reason text not null,
  local_payload jsonb,
  cloud_payload jsonb,
  resolution text not null default 'pending',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint sync_conflicts_resolution_check
    check (resolution in ('pending', 'accepted_local', 'accepted_cloud', 'merged')),
  constraint sync_conflicts_tenant_device_fk
    foreign key (tenant_id, device_id)
    references public.devices (tenant_id, id) on delete cascade
);

create index if not exists sync_conflicts_tenant_device_idx
  on public.sync_conflicts (tenant_id, device_id, resolution);
