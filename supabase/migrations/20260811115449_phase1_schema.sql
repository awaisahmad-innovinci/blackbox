-- Phase 1 schema: multi-tenant RBAC, devices, refresh tokens, sync foundation.
-- Permission catalog is seeded here. Tenants, users, and roles are created at signup (Auth step).
--
-- Tenant isolation: NestJS derives tenant_id from authenticated server context and must
-- filter all queries accordingly. This migration does NOT enable RLS policies (see docs).
-- Composite FKs on junction tables prevent cross-tenant user↔ role and device ↔ user links.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- tenants
-- ---------------------------------------------------------------------------
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.tenants is 'Root tenant (business) entity';

-- ---------------------------------------------------------------------------
-- permissions (global catalog — no tenant_id)
-- ---------------------------------------------------------------------------
create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  description text not null default '',
  created_at timestamptz not null default now(),
  constraint permissions_key_key unique (key)
);

comment on table public.permissions is 'Global permission catalog; authorization checks permission keys, not role names';

create index permissions_key_idx on public.permissions (key);

-- ---------------------------------------------------------------------------
-- roles (tenant-scoped)
-- ---------------------------------------------------------------------------
create table public.roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  key text not null,
  name text not null,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint roles_tenant_id_key_key unique (tenant_id, key),
  constraint roles_tenant_id_id_key unique (tenant_id, id)
);

comment on table public.roles is 'Tenant-scoped roles; is_system marks default OWNER/MANAGER/… seeds';

create index roles_tenant_id_idx on public.roles (tenant_id);

-- ---------------------------------------------------------------------------
-- users (tenant-scoped)
-- ---------------------------------------------------------------------------
create table public.users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  email text not null,
  username text not null,
  full_name text not null,
  password_hash text not null,
  is_active boolean not null default true,
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_tenant_id_email_key unique (tenant_id, email),
  constraint users_tenant_id_username_key unique (tenant_id, username),
  constraint users_tenant_id_id_key unique (tenant_id, id),
  constraint users_email_nonempty check (length(trim(email)) > 0),
  constraint users_username_nonempty check (length(trim(username)) > 0)
);

comment on table public.users is 'Tenant users; login via email or username (identifier)';

create index users_tenant_id_idx on public.users (tenant_id);
create index users_tenant_id_email_idx on public.users (tenant_id, email);
create index users_tenant_id_username_idx on public.users (tenant_id, username);

-- ---------------------------------------------------------------------------
-- role_permissions (role ↔ global permission)
-- ---------------------------------------------------------------------------
create table public.role_permissions (
  role_id uuid not null references public.roles (id) on delete cascade,
  permission_id uuid not null references public.permissions (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_id)
);

comment on table public.role_permissions is 'Many-to-many: Role → Permission';

create index role_permissions_permission_id_idx on public.role_permissions (permission_id);

-- ---------------------------------------------------------------------------
-- user_roles (same-tenant enforced via composite FKs)
-- ---------------------------------------------------------------------------
create table public.user_roles (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null,
  role_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, role_id),
  constraint user_roles_tenant_user_fk
    foreign key (tenant_id, user_id) references public.users (tenant_id, id) on delete cascade,
  constraint user_roles_tenant_role_fk
    foreign key (tenant_id, role_id) references public.roles (tenant_id, id) on delete cascade
);

comment on table public.user_roles is 'Many-to-many: User → Role; composite FKs block cross-tenant links';

create index user_roles_tenant_id_idx on public.user_roles (tenant_id);
create index user_roles_role_id_idx on public.user_roles (role_id);

-- ---------------------------------------------------------------------------
-- devices (tenant-scoped)
-- ---------------------------------------------------------------------------
create table public.devices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  fingerprint text not null,
  name text not null,
  status text not null default 'pending',
  trusted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint devices_tenant_id_fingerprint_key unique (tenant_id, fingerprint),
  constraint devices_tenant_id_id_key unique (tenant_id, id),
  constraint devices_status_check check (status in ('pending', 'trusted', 'revoked')),
  constraint devices_fingerprint_nonempty check (length(trim(fingerprint)) > 0)
);

comment on table public.devices is 'Tenant-owned devices; one local SQLite DB per tenant+device (app layer)';

create index devices_tenant_id_idx on public.devices (tenant_id);
create index devices_tenant_id_status_idx on public.devices (tenant_id, status);

-- ---------------------------------------------------------------------------
-- device_users (many users per device; same-tenant enforced)
-- ---------------------------------------------------------------------------
create table public.device_users (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  device_id uuid not null,
  user_id uuid not null,
  offline_enabled boolean not null default true,
  offline_expires_at timestamptz,
  last_online_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (device_id, user_id),
  constraint device_users_tenant_device_fk
    foreign key (tenant_id, device_id) references public.devices (tenant_id, id) on delete cascade,
  constraint device_users_tenant_user_fk
    foreign key (tenant_id, user_id) references public.users (tenant_id, id) on delete cascade
);

comment on table public.device_users is 'Device ↔ User association; offline_expires_at renewed on online auth (default +7 days)';

create index device_users_tenant_id_idx on public.device_users (tenant_id);
create index device_users_user_id_idx on public.device_users (user_id);

-- ---------------------------------------------------------------------------
-- refresh_tokens
-- ---------------------------------------------------------------------------
create table public.refresh_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  device_id uuid references public.devices (id) on delete set null,
  token_hash text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  replaced_by uuid references public.refresh_tokens (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint refresh_tokens_token_hash_key unique (token_hash),
  constraint refresh_tokens_token_hash_nonempty check (length(trim(token_hash)) > 0)
);

comment on table public.refresh_tokens is 'Hashed refresh tokens with rotation (replaced_by); never store raw tokens';

create index refresh_tokens_user_id_idx on public.refresh_tokens (user_id);
create index refresh_tokens_tenant_id_idx on public.refresh_tokens (tenant_id);
create index refresh_tokens_device_id_idx on public.refresh_tokens (device_id);
create index refresh_tokens_expires_at_idx on public.refresh_tokens (expires_at);

-- ---------------------------------------------------------------------------
-- sync_cursors (foundation only — auth_snapshot stream in Phase 1; no business sync)
-- ---------------------------------------------------------------------------
create table public.sync_cursors (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  device_id uuid not null,
  stream text not null,
  cursor text not null default '',
  updated_at timestamptz not null default now(),
  constraint sync_cursors_device_id_stream_key unique (device_id, stream),
  constraint sync_cursors_tenant_device_fk
    foreign key (tenant_id, device_id) references public.devices (tenant_id, id) on delete cascade,
  constraint sync_cursors_stream_nonempty check (length(trim(stream)) > 0)
);

comment on table public.sync_cursors is 'Cloud↔device sync foundation; Phase 1 uses auth_snapshot only — no business-data sync';

create index sync_cursors_tenant_id_idx on public.sync_cursors (tenant_id);

-- ---------------------------------------------------------------------------
-- Phase 1 permission catalog seed (no tenants/users/roles)
-- ---------------------------------------------------------------------------
insert into public.permissions (key, description) values
  ('web.access', 'Access the web admin application'),
  ('desktop.access', 'Access the desktop application shell'),
  ('tenant.settings.read', 'View tenant settings'),
  ('tenant.settings.write', 'Update tenant settings'),
  ('users.read', 'List and view users'),
  ('users.write', 'Create and update users'),
  ('users.deactivate', 'Deactivate users'),
  ('roles.read', 'List and view roles'),
  ('roles.write', 'Create and update roles and role permissions'),
  ('permissions.read', 'View the permission catalog'),
  ('devices.read', 'List and view devices'),
  ('devices.manage', 'Register, trust, revoke, and manage device associations');
