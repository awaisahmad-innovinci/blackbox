# Blackbox — QA Issues List

> **Superseded by [codebase-review.md](./codebase-review.md)** (16 Nov 2026). Some items below are out of date (e.g. CORS is now fixed).

| | |
|---|---|
| **Product** | Blackbox retail management SaaS |
| **Document** | QA findings: bugs, errors and improvements, with priority |
| **Reviewer role** | Senior Developer and QA tester |
| **Date** | November 2026 |
| **Companion docs** | [requirements.md](./requirements.md), [product-guide.md](./product-guide.md) |

---

## How to read this list

Each issue has a **title**, a plain-words **detail**, a **priority**, and **where** it is in the code.

| Priority | Meaning |
|----------|---------|
| **P0 — Blocker** | Must be fixed before production. Risk of data leak, data loss or abuse. |
| **P1 — High** | Fix before launch, or straight after with a firm plan. |
| **P2 — Medium** | Real improvement; schedule it. Does not block launch alone. |
| **P3 — Low** | Cleanup and polish. |

**Verdict: not production-ready yet.** The build is feature-rich and well organised, but a
large slice of the API can be used **without logging in**, there are **no automated tests**, and
there is **no protection against password guessing**. Fix the P0 items first. They are few and
fixable.

**Quick count:** 3 blockers (P0), 6 high (P1), 6 medium (P2), 3 low (P3).

---

## P0 — Blockers (fix before production)

### P0-1 — Many inventory and purchasing endpoints work without logging in
- **Priority:** P0
- **Where:** `apps/api/src/app.module.ts` (global guard is `OptionalJwtAuthGuard`), and these 13 controllers have **no** guard at all:
  - `inventory/products`, `inventory/brands`, `inventory/categories`, `inventory/units`
  - `inventory/vendors`, `inventory/vendors/vendor-groups`, `inventory/vendors/vendor-skus`, `inventory/vendor-returns`
  - `inventory/purchase-orders`, `inventory/goods-receipts`
  - `inventory/inventory-out`, `inventory/inventory-out-returns`
  - `inventory/imports/master-data-import`
- **Detail:** The global login check is **optional** by default. Most modules add their own lock, but these 13 do not. Anyone who can reach the server can list or change products, suppliers, purchase orders, receive goods, move stock to the floor, and bulk-import data — with no username or password. For a system holding many businesses' data, this is the most serious risk: it can leak data and corrupt stock and purchasing records.
- **Fix:** Add `@UseGuards(JwtAuthGuard, PermissionsGuard)` and the right `@RequirePermissions(...)` (`inventory.access`, `purchasing.access`, `vendors.access`, `warehouses.write`, etc.) to each controller. The permission keys already exist in `packages/shared/src/permissions.ts`.

### P0-2 — A few "guarded" controllers still leave some endpoints open
- **Priority:** P0
- **Where:** `apps/api/src/inventory/dashboard/dashboard.controller.ts` (e.g. the summary route uses `@UseGuards(JwtAuthGuard)` only, no permission), and other controllers that apply guards **per method** instead of on the whole class.
- **Detail:** Some controllers look protected because one method has a guard, but other methods on the same controller have none or have no permission requirement. This leaves gaps that are easy to miss in review.
- **Fix:** Prefer a class-level `@UseGuards(...)` with explicit per-method `@RequirePermissions(...)`, and audit every route so none is unintentionally public.

### P0-3 — The "fallback business" logic is broken and unsafe
- **Priority:** P0
- **Where:** `apps/api/src/inventory/common/fixed-tenant.context.ts`
- **Detail:** The unguarded endpoints decide which business they act for using `FixedTenantContext`. It is supposed to fall back to a development business id when there is no login, but the code reads the request tenant **in the constructor** (at startup), so the fallback is effectively always empty. The `ConfigService` is injected but never used, the imported `DEMO_STORE_TENANT_ID` is unused, and the field is typed `any`. Anonymous requests therefore act on an **undefined** business — a security hole and a correctness bug.
- **Fix:** After P0-1, every request carries a real business from the token. Remove the fallback entirely, drop the unused `ConfigService` and import, and type the value as `string`.

### P0-4 — No automated tests anywhere
- **Priority:** P0
- **Where:** whole repository (no `*.spec.ts`, `*.test.ts`, or e2e tests exist).
- **Detail:** Money, stock and tax math runs here. Without tests, any change can silently break a bill total, a stock count or an FBR invoice, and no one notices until a customer does.
- **Fix:** Add a core safety net before launch: unit tests for the formulas in `packages/shared` (till limits, drawer balance, bill totals, tax math) and integration tests for the critical flows in [requirements.md](./requirements.md) (post a sale, void, return/refund, receive goods, inventory out, sync push/pull). Run them in CI (see P1-5).

---

## P1 — High priority (strongly recommended before launch)

### P1-1 — No protection against password guessing
- **Priority:** P1
- **Where:** `apps/api/src/auth/*` and `apps/api/src/main.ts` (no `@nestjs/throttler`).
- **Detail:** The login endpoint has no rate limiting, so an attacker can try thousands of passwords per minute. Only forgot-password has a hand-written limit (3/hour).
- **Fix:** Add a global rate limiter and apply a strict limit to `/auth/login`, `/auth/refresh` and `/auth/forgot-password`.

### P1-2 — No HTTP security headers
- **Priority:** P1
- **Where:** `apps/api/src/main.ts` (no `helmet`).
- **Detail:** Standard security headers are missing. They are a cheap, standard layer of defence and their absence is a red flag in any production review.
- **Fix:** Add `helmet` to the API, and review headers for the web and platform apps.

### P1-3 — Owner refresh token stored in browser local storage
- **Priority:** P1
- **Where:** web admin session handling (see [web-admin.md](./web-admin.md)).
- **Detail:** The long-lived refresh token is kept in `localStorage`. If a script ever runs on the page (an XSS attack), it can steal that token and stay signed in as the owner. The team documented this as a conscious Phase 1 trade-off.
- **Fix:** Plan the move to secure, http-only cookies (a "BFF" pattern) before or shortly after launch. Until then, be strict about content-security-policy and input escaping.

### P1-4 — CORS silently falls back to localhost
- **Priority:** P1
- **Where:** `apps/api/src/main.ts` (defaults to `http://localhost:3000,3001` when `CORS_ORIGINS` is unset).
- **Detail:** In production a missing setting would silently block the real web and platform apps, or allow the wrong origins if edited carelessly. `credentials: true` makes the correct origin list important.
- **Fix:** Require `CORS_ORIGINS` in production (fail fast if missing) and document the exact values per environment.

### P1-5 — CI only builds the desktop app
- **Priority:** P1
- **Where:** `.github/workflows/build-desktop.yml` is the only workflow.
- **Detail:** There is no automatic `typecheck`, `lint` or `test` for the API, web or platform apps on each change, so type errors and bugs can reach the main branch unnoticed.
- **Fix:** Add a CI job that runs `pnpm typecheck`, `pnpm lint` and the new tests (P0-4) on every pull request, for all apps.

### P1-6 — No database-level isolation as a safety net
- **Priority:** P1
- **Where:** app-wide design (no row-level security; see [architecture.md](./architecture.md)).
- **Detail:** All business-to-business isolation is in application code. This is an accepted decision, but it means one missed filter (as in P0-1) exposes other businesses' data with no second line of defence.
- **Fix:** Treat P0-1 and testing as mandatory compensating controls. Consider database-level isolation as future hardening.

---

## P2 — Medium priority

### P2-1 — No global error handler
- **Priority:** P2
- **Where:** `apps/api/src` (only a local filter exists, `MasterDataUploadExceptionFilter`; no app-wide `APP_FILTER` or `useGlobalFilters`).
- **Detail:** Without a global exception filter, internal errors may be returned to clients in raw form, which can leak implementation details and give inconsistent error shapes.
- **Fix:** Add a global exception filter that returns safe, consistent messages and logs the detail server-side.

### P2-2 — No sample environment file for the API
- **Priority:** P2
- **Where:** `apps/api/` (web and desktop have `.env.example`; the API does not).
- **Detail:** Without a template, a deployment can easily miss a required setting (database URL, JWT secrets, CORS, email), causing failures that are hard to diagnose.
- **Fix:** Add `apps/api/.env.example` listing every required variable.

### P2-3 — Dead and confusing code in the tenant context
- **Priority:** P2
- **Where:** `apps/api/src/inventory/common/fixed-tenant.context.ts`
- **Detail:** Unused `ConfigService`, unused `DEMO_STORE_TENANT_ID` import, and an `any`-typed field. Confusing to read and maintain.
- **Fix:** Remove as part of P0-3.

### P2-4 — Card terminal serial/COM mode is unfinished
- **Priority:** P2
- **Where:** `apps/desktop/src/main/pos/card-terminal/` (see [pos-card-terminal.md](./pos-card-terminal.md)).
- **Detail:** Only "USB keyboard" mode works. The direct serial/COM connection to bank machines is not implemented for all banks, so staff could be surprised if they expect it.
- **Fix:** Finish per-bank serial support, or clearly mark it unsupported in the UI.

### P2-5 — Purchase orders cannot be partially received
- **Priority:** P2
- **Where:** `apps/api/src/inventory/goods-receipts/` (one posted receipt per order).
- **Detail:** If a delivery arrives in parts, the system cannot record it as a partial receipt. This may or may not match how the shops actually work.
- **Fix:** Confirm with the business; if partial deliveries are common, plan the feature (already noted as future scope).

### P2-6 — The `auth_snapshot` sync stream is reserved but not built
- **Priority:** P2
- **Where:** sync design (see [sync.md](./sync.md)).
- **Detail:** One of the four sync streams is a placeholder. Fine for now, but it should not be assumed to work.
- **Fix:** Confirm nothing in production depends on it yet; track as planned work.

---

## P3 — Low priority (cleanup and polish)

### P3-1 — A few React hooks suppress the dependency lint rule
- **Priority:** P3
- **Where:** desktop renderer (e.g. `SkuProfilePage.tsx`, `list-pagination.tsx`).
- **Detail:** Suppressing "exhaustive dependencies" can hide subtle bugs where the screen does not refresh when it should.
- **Fix:** Review each case; confirm it is safe or refactor.

### P3-2 — Some docs predate the current document-numbering scheme
- **Priority:** P3
- **Where:** older files under `docs/`.
- **Detail:** A few docs still show the old number format. The SRS already uses the real scheme from `packages/shared/src/document-numbers.ts`.
- **Fix:** Bring the older docs in line with the code.

### P3-3 — No centralised, structured logging
- **Priority:** P3
- **Where:** API-wide.
- **Detail:** There is no request-id-based structured logging, which makes live support and debugging harder.
- **Fix:** Add structured logging with request ids once live.

---

## What is already good

- Clear, consistent monorepo structure and naming.
- Strong auth basics: Argon2 password hashing, refresh tokens stored only as hashes, short-lived rotated access tokens, and JWT secrets required with no insecure default (`getOrThrow`).
- Permission-based access control with AND semantics on the modules that enforce it.
- Tenant isolation design using composite foreign keys, so the database prevents cross-business links.
- Safe database practice: schema only via migrations, ORM never auto-alters the schema.
- Thoughtful offline design: an outbox that does not drop queued changes, backoff retries, and atomic posting.
- Global input validation (`whitelist`, `forbidNonWhitelisted`, `transform`).
- Real device trust and remote-wipe features.
- Secrets kept out of version control (only `.env.example` files are tracked).

---

## Pre-production checklist (go / no-go)

- [ ] **P0-1** Every inventory, vendor, purchasing and import endpoint requires login and the right permission.
- [ ] **P0-2** No route is unintentionally public; guards reviewed per method.
- [ ] **P0-3** The broken tenant fallback is removed; business always comes from the token.
- [ ] **P0-4** Core unit and integration tests exist and pass for money, stock, sales, returns and sync.
- [ ] **P1-1** Rate limiting on login and other auth endpoints.
- [ ] **P1-2** Security headers (helmet) enabled.
- [ ] **P1-4** `CORS_ORIGINS` required and correct per environment.
- [ ] **P1-5** CI runs typecheck, lint and tests for all apps.
- [ ] **P2-1** Internal errors are not exposed to clients.
- [ ] **P2-2** An API `.env.example` documents all required settings.
- [ ] A plan and date exist for **P1-3** (move the web refresh token to secure cookies).

---

*End of report.*
