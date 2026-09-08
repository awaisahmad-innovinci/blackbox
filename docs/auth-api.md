# Auth API

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
| POST | `/auth/forgot-password` | public (`email`) |
| POST | `/auth/reset-password` | public (`email`, `code`, `newPassword`) |
| GET | `/auth/me` | Bearer access JWT |
| GET | `/devices/me` | Bearer access JWT + `desktop.access` |

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
- Resolve user → verify Argon2 password → **`401 Invalid credentials`** if the user is missing or the password is wrong (same message for both, so existence is not leaked).
- If the password is correct but the user is **deactivated** (`is_active = false`), respond with **`403`** and message **`This account has been deactivated by an administrator.`**
- Then verify the tenant is active; inactive tenant → **`401 Invalid credentials`**.

**Desktop single session** (after credentials and permissions are verified):

- One active desktop session per user. Web sessions (`device_id` null) do **not** block desktop login.
- If the user already has a non-revoked, unexpired refresh token on a **different** `device_id`, respond with **`409 Conflict`** and message **`This account is already signed in on another device. Sign out there first, then try again.`**
- Re-login on the **same** desktop (same fingerprint / `device_id`) revokes the previous desktop refresh token and proceeds.
- Wrong username/password still returns **`401 Invalid credentials`** only — the session check runs **after** password verification.

### JWT access token

Minimal claims: `sub` (user id), `tenantId`. `iat` / `exp` from the JWT library (access TTL **15 minutes** / 900s).

Tenant context for protected routes always comes from the validated JWT — never trust body `tenant_id`.

### Refresh (`POST /auth/refresh`)

Hash lookup → reject expired/revoked → verify user/tenant active → rotate in a transaction (revoke old with `replaced_by`, insert new hash) → return new access + refresh. Refresh TTL **7 days**.

### Logout (`POST /auth/logout`)

Revoke matching refresh token by hash; idempotent `{ success: true }`.

### Forgot password (`POST /auth/forgot-password`)

Owner self-service password reset (web sign-in page). Body: `{ "email": "owner@example.com" }`.

- Always responds **`200`** with a generic message: **`If an account exists for this email, we sent a verification code.`** (does not reveal whether the email exists).
- Sends a **6-digit OTP** only when the email matches **exactly one** active user with the **OWNER** role on an active tenant.
- OTP is stored as **SHA-256 hash** in `password_reset_codes` (default TTL **10 minutes** via `PASSWORD_RESET_OTP_TTL_SECONDS`).
- Rate limit: **3 requests per user per hour**.
- Email via **[Resend](https://resend.com)** when `RESEND_API_KEY` is set; in development without a key, the OTP is logged to the API console.

### Reset password (`POST /auth/reset-password`)

Body: `{ "email", "code", "newPassword" }` (`newPassword` min 8 chars, `code` 6 digits).

- Verifies OTP for the same OWNER lookup as forgot-password.
- On success: updates `users.password_hash`, marks the code used, **revokes all refresh tokens** for that user.
- Invalid or expired code → **`400`** with **`Invalid or expired verification code`**.

## Who creates credentials

1. The first account is created by **`POST /auth/signup-tenant`**: it creates the tenant, the
   system roles with their permissions, the OWNER user, and a `cloud-hub` device row used as the
   origin device for changes written through the REST API.
2. Every other account is created by the owner (or anyone with `users.write`) through
   **`POST /users`** in the web admin, and roles are assigned with **`PUT /users/:id/roles`**.
   The owner sets the initial password; the user signs in with email or username.
3. Permissions are never attached to a user directly. They resolve through
   `user_roles → role_permissions → permissions`, so changing a role changes what the user can do
   on the next token issue or refresh.

Only accounts whose roles include **`desktop.access`** can sign in from the desktop app; the login
endpoint rejects a desktop client without it with `403`. Sync additionally requires `sync.use`.

## Desktop device sessions

Desktop login sends `client: "desktop"` plus a machine `fingerprint`, and the server:

1. Verifies the credentials and the `desktop.access` permission.
2. Finds or creates the `devices` row for `(tenant_id, fingerprint)` with status `pending`, and
   upserts the `device_users` link that carries the offline authorization window.
3. Issues an access token whose `deviceId` claim binds the session to that device, and stores the
   refresh token with the same `device_id`.

A `pending` device can read `/devices/me` and `/sync/status` but cannot push or pull — an owner
must trust it (`POST /devices/:id/trust`, web admin → Devices → Trust device). Revoking a device
(`POST /devices/:id/revoke`) also revokes its refresh tokens, so the desktop is signed out on its
next request.

### Desktop token lifecycle

The access token lives 15 minutes and the desktop refreshes it automatically: `apiFetch` retries a
`401` once after rotating the refresh token, with a single-flight guard so parallel requests do not
revoke each other's token. If refresh fails, the stored tokens are cleared and the app returns to
the sign-in screen. When the API is unreachable, tokens are kept and the app opens in offline mode
against the local SQLite database; queued changes push after the next successful sign-in or sync.

## Database tables

| Table | Holds | Key columns |
|-------|-------|-------------|
| `tenants` | One row per business; login fails if inactive | `id`, `name`, `is_active` |
| `users` | Login identity and Argon2 password hash | `id`, `tenant_id`, `email`, `username`, `password_hash`, `is_active` |
| `roles` | System roles per tenant (OWNER, MANAGER, …) | `id`, `tenant_id`, `key`, `name` |
| `permissions` | Global catalog of permission keys | `id`, `key` |
| `role_permissions` | Which permissions a role grants | `role_id`, `permission_id` |
| `user_roles` | Which roles a user has | `user_id`, `role_id` |
| `refresh_tokens` | SHA-256 hash of each refresh token, rotation chain | `token_hash`, `user_id`, `device_id`, `expires_at`, `revoked_at`, `replaced_by` |
| `devices` | Registered machines and their trust state | `id`, `tenant_id`, `fingerprint`, `status`, `trusted_at`, `revoked_at`, `needs_full_resync` |
| `device_users` | Which users may work offline on a device | `device_id`, `user_id`, `offline_enabled`, `offline_expires_at`, `last_online_at` |
| `password_reset_codes` | Hashed owner forgot-password OTPs | `user_id`, `code_hash`, `expires_at`, `used_at` |

Passwords live only in `users.password_hash`; refresh tokens only as hashes in `refresh_tokens`.
Access tokens are never stored server-side — they are verified from their signature and claims.

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
