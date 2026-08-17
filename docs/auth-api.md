# Auth API (Phase 1)

NestJS uses **TypeORM** against Supabase PostgreSQL with `synchronize: false`.
Schema is applied only via `supabase/migrations/` — not TypeORM migrations.

## Stack

```
NestJS AuthModule → TypeORM → Supabase PostgreSQL
```

## Endpoints

| Method | Path | Auth |
|--------|------|------|
| POST | `/auth/signup-tenant` | public |
| POST | `/auth/login` | public (`identifier` + `password` + `client`) |
| POST | `/auth/refresh` | public (`refreshToken`) |
| POST | `/auth/logout` | public (`refreshToken`) |
| GET | `/auth/me` | Bearer access JWT |

Auth routes do **not** use `@RequirePermissions` — authentication stays separate from RBAC authorization.
Permission checks use `JwtAuthGuard` + `PermissionsGuard` on other routes (e.g. `GET /rbac/check`).

## Behavior

### Signup (`POST /auth/signup-tenant`)

In one DB transaction: create tenant → system roles → `role_permissions` (resolved by **stable permission keys** from the seeded catalog, never hard-coded UUIDs) → OWNER user (Argon2 password hash) → `user_roles`. Then issue access + refresh tokens (refresh stored as SHA-256 hash only).

Duplicate tenant-scoped email/username → `409 Conflict`.

### Login (`POST /auth/login`)

- `identifier`: email if it contains `@`, otherwise username.
- Email/username are **tenant-scoped** and the request has **no** `tenant_id`. If the identifier matches **0 or multiple** users across tenants, respond with the same generic **`401 Invalid credentials`**.
- `client` (`web` | `desktop`) is behavior-only — **not** an authorization mechanism.
- Verify active user + active tenant + Argon2 password.

### JWT access token

Minimal claims: `sub` (user id), `tenantId`. `iat` / `exp` from the JWT library (access TTL **15 minutes** / 900s).

Tenant context for protected routes always comes from the validated JWT — never trust body `tenant_id`.

### Refresh (`POST /auth/refresh`)

Hash lookup → reject expired/revoked → verify user/tenant active → rotate in a transaction (revoke old with `replaced_by`, insert new hash) → return new access + refresh. Refresh TTL **7 days**.

### Logout (`POST /auth/logout`)

Revoke matching refresh token by hash; idempotent `{ success: true }`.

## Security

- Argon2 passwords; SHA-256 refresh token hashes only
- No plaintext passwords/tokens; no passwords in JWTs
- JWTs are not offline credentials

## Manual smoke (when Postgres is available)

```bash
cp apps/api/.env.example apps/api/.env
# set DATABASE_URL + JWT secrets; apply migrations
pnpm --filter @blackbox/api dev

curl -s localhost:4000/auth/signup-tenant -H 'content-type: application/json' -d '{
  "businessName":"Acme",
  "fullName":"Owner One",
  "email":"owner@acme.test",
  "username":"owner1",
  "password":"password123"
}'
```

Then: login → `GET /auth/me` → refresh → logout → refresh should fail.

Integration tests against real Postgres are **environment-blocked** until Docker/Postgres is available. Do **not** substitute mocks for Postgres.
