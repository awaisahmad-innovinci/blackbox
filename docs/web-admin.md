# Web Admin (Phase 1)

Next.js app at `apps/web` connected to Nest auth + tenant admin APIs.

## Environment

```bash
cp apps/web/.env.example apps/web/.env.local
# NEXT_PUBLIC_API_URL=http://localhost:4000
```

## Session model (Phase 1 trade-off)

| Token | Storage |
|-------|---------|
| Access (15m) | **Memory only** — never written to `localStorage` |
| Refresh (7d) | `localStorage` key `bb_refresh` |

Refresh rotation **atomically replaces** `bb_refresh` so the old token is not retained after success.

**Conscious trade-off:** `localStorage` is readable by JavaScript (XSS). Phase 1 does **not** use a BFF/httpOnly-cookie redesign. Mitigate with CSP/XSS hygiene; revisit cookies in a later hardening step.

Rules:

- A stored refresh token alone is **not** authenticated until `POST /auth/refresh` + `GET /auth/me` succeed.
- `apiFetch` uses single-flight refresh; concurrent 401s share one refresh; original request is retried **once**.
- Logout always clears local session (even if revoke API fails).
- Never put tokens in URLs, UI, or logs.
- Never send `tenant_id` as an authorization input — Nest uses JWT tenant context.
- Login always sends `client: "web"` (behavior metadata only).

## Routes

| Path | Access |
|------|--------|
| `/` | Landing login / tenant signup |
| `/app` | Dashboard (authenticated) |
| `/app/users` | `users.read` (+ write/deactivate actions gated) |
| `/app/roles` | `roles.read` (+ write gated) |
| `/app/permissions` | `permissions.read` |
| `/app/devices` | `devices.read` (+ revoke needs `devices.manage`) |
| `/app/settings` | `tenant.settings.read` (+ write gated) |

Frontend permission checks are **UX/routing only**. Nest `PermissionsGuard` is the security boundary.

System role keys are read-only in the UI (matches API). No device registration in web.

## Smoke checklist

Requires API + Postgres:

1. Signup → `/app`
2. Login → `/app`; logout → `/`
3. Expired access → refresh → request succeeds
4. Refresh failure → session cleared → `/`
5. Permission present → section works; missing → forbidden / hidden nav
6. Direct URL without permission → forbidden state
7. Unauthenticated `/app` → redirect `/`

If Postgres/API unavailable: live smoke is **environment-blocked** — do not mock the backend.
