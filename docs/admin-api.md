# Admin API (Phase 1)

Tenant administration endpoints. NestJS + TypeORM + Supabase Postgres.
`synchronize: false` — schema only via `supabase/migrations/`.

## Rules

- Every route: `JwtAuthGuard` + `PermissionsGuard` + `@RequirePermissions(...)`.
- Tenant scope always from JWT `tenantId` — never from body/query/route `tenant_id`.
- Wrong-tenant ids return **404** (same as missing).
- Responses never include `passwordHash` or refresh token hashes.
- User roles: full replace via `PUT /users/:id/roles`.
- No device registration in Phase 1 admin (read + revoke only).
- No role DELETE endpoint.

## Endpoints

### Tenants

| Method | Path | Permission |
|--------|------|------------|
| GET | `/tenants/current` | `tenant.settings.read` |
| PATCH | `/tenants/current` | `tenant.settings.write` |

PATCH body: `{ "name": "..." }` only.

### Users

| Method | Path | Permission |
|--------|------|------------|
| GET | `/users` | `users.read` |
| GET | `/users/:id` | `users.read` |
| POST | `/users` | `users.write` |
| PATCH | `/users/:id` | `users.write` |
| POST | `/users/:id/deactivate` | `users.deactivate` |
| PUT | `/users/:id/roles` | `users.write` |

Create body: `email`, `username`, `fullName`, `password`, optional `roleIds[]`.  
Roles body: `{ "roleIds": ["..."] }` (must all belong to current tenant).

Deactivate also revokes active refresh tokens and disables offline on `device_users`.

### Roles

| Method | Path | Permission |
|--------|------|------------|
| GET | `/roles` | `roles.read` |
| GET | `/roles/:id` | `roles.read` |
| POST | `/roles` | `roles.write` |
| PATCH | `/roles/:id` | `roles.write` |
| PUT | `/roles/:id/permissions` | `roles.write` |

Create: `key`, `name`, optional `permissionIds[]` (`isSystem=false`).  
System role keys cannot be changed. Permission UUIDs must exist in the global catalog.

### Permissions (catalog, read-only)

| Method | Path | Permission |
|--------|------|------------|
| GET | `/permissions` | `permissions.read` |

### Devices (admin read/revoke)

| Method | Path | Permission |
|--------|------|------------|
| GET | `/devices` | `devices.read` |
| GET | `/devices/:id` | `devices.read` |
| POST | `/devices/:id/revoke` | `devices.manage` |

Revoke sets `status=revoked` and revokes refresh tokens for that device.

## Isolation / permission smoke checklist

Requires Postgres with migrations applied:

1. Correct permission → 200; missing permission → 403; no JWT → 401  
2. Tenant A cannot access tenant B user/role/device (404)  
3. Tenant A cannot assign tenant B `roleId`  
4. Unknown permission UUID on role → 400  

If Postgres is unavailable, treat live smoke as **environment-blocked** — do not mock the database.
