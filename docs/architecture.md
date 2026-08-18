# Blackbox architecture

Single source of truth for agents and developers. Follow these conventions to avoid
breaking the monorepo layout.

## Overview

pnpm workspaces + Turborepo monorepo.

| Area | Path | Notes |
|------|------|--------|
| Web | `apps/web` | Next.js App Router |
| Desktop | `apps/desktop` | Electron + Vite + React renderer |
| API | `apps/api` | NestJS |
| UI | `packages/ui` | Shared shadcn / Radix / Tailwind (`@blackbox/ui`) |
| Shared | `packages/shared` | Permissions, roles, auth/device/inventory DTOs (`@blackbox/shared`) |
| TS configs | `packages/typescript-config` | Shared `tsconfig` bases |
| ESLint | `packages/eslint-config` | Shared ESLint flat configs |
| DB | `supabase/migrations/` | Supabase CLI migrations (plural) |

Package scope is always `@blackbox/*`. Workspace deps use `workspace:*`.

## Why UI is shared

Install Tailwind, Radix, CVA, `clsx`, `tailwind-merge`, `lucide-react`, and shadcn
components **once** in `packages/ui`. Both web and desktop import the same components.

**Do not** install Radix, shadcn, or Tailwind design packages separately in `apps/web`
or `apps/desktop` except framework glue:

- Web: `@tailwindcss/postcss` + `tailwindcss` for CSS processing
- Desktop: `@tailwindcss/vite` + `tailwindcss` for Vite CSS processing

Apps must not fork the design system.

### Redesign later (important)

Baseline components in `@blackbox/ui` are **stock shadcn / New York primitives**. A future
pass will restyle them to a Blackbox-specific design system. Until then:

- Change visuals **only** in `packages/ui` (tokens in `globals.css`, component variants).
- Do **not** fork or copy components into `apps/web` or `apps/desktop`.
- Keep import paths stable (`@blackbox/ui/button`, `@blackbox/ui/dialog`, …) so apps do not churn.

### Baseline primitives installed

`button`, `sheet`, `dialog`, `alert-dialog`, `drawer`, `sidebar`, `collapsible`,
`dropdown-menu`, `select`, `popover`, `input`, `textarea`, `label`, `checkbox`,
`radio-group`, `switch`, `form`, `navigation-menu`, `breadcrumb`, `command`, `alert`,
`card`, `badge`, `separator`, `skeleton`, `scroll-area`, `tabs`, `tooltip`.

Compose search/nav from `command` + `input` and `navigation-menu` / `breadcrumb` — do not
add branded composites (`SearchBar`, `NavLink`) until the redesign pass.

## Adding a shadcn component

From the repo root:

```bash
pnpm dlx shadcn@latest add <name> -c packages/ui
```

Components land in `packages/ui/src/components/`. Export via package.json subpaths:

```ts
import { Button } from "@blackbox/ui/button";
import { Dialog, DialogContent } from "@blackbox/ui/dialog";
```

`packages/ui/components.json` is the shadcn config for this monorepo.

Hooks (e.g. sidebar mobile): `import { useIsMobile } from "@blackbox/ui/hooks/use-mobile"`.

## Consuming `@blackbox/ui`

### Web (`apps/web`)

1. Dependency: `"@blackbox/ui": "workspace:*"`
2. `next.config.ts`: `transpilePackages: ["@blackbox/ui"]`
3. Import CSS once in the root layout CSS file:

```css
@import "@blackbox/ui/globals.css";
@source "../../../../packages/ui/src/**/*.{ts,tsx}";
```

4. Import components in pages/layouts as needed.

### Desktop (`apps/desktop`)

1. Dependency: `"@blackbox/ui": "workspace:*"`
2. Renderer uses Vite + `@tailwindcss/vite`
3. Import CSS once in the renderer:

```css
@import "@blackbox/ui/globals.css";
@source "../../../../../packages/ui/src/**/*.{ts,tsx}";
```

4. Same component imports as web — no Next-only APIs in shared UI.

### Shared UI rules

- Keep `@blackbox/ui` framework-agnostic (React only).
- Never use `next/image`, `next/link`, or Next server APIs inside `packages/ui`.
- Prefer Radix primitives + CVA variants for interactive components.

## Desktop architecture

```
apps/desktop/
  src/main/          # Electron main process (Node)
  src/preload/       # contextBridge / IPC bridge
  src/renderer/      # Vite + React UI (imports @blackbox/ui)
  electron.vite.config.ts
  electron-builder.yml
```

- Main: window lifecycle, native APIs
- Preload: expose a narrow, typed API via `contextBridge` (see `window.blackbox`)
- Renderer: same React UI as web; works offline as a local bundle
- Package with `pnpm --filter @blackbox/desktop package` (electron-builder)

## NestJS API

- Entry: `apps/api/src/main.ts` (default port `4000`)
- Health: `GET /health`
- No UI dependencies
- Tenant isolation: JWT `tenantId` + app-layer filters — not client-supplied `tenant_id`
- Auth endpoints: see [auth-api.md](./auth-api.md)
- Access JWT claims (minimal): `sub` (user id), `tenantId`; TTLs 15m access / 7d refresh
- Login `identifier` is email-or-username without `tenant_id`; 0 or >1 matches → generic 401
- Signup seeds role permissions by **permission key** from the migration catalog (not hard-coded UUIDs)

### RBAC (permission-based)

- Authorization checks **permission keys** from `@blackbox/shared` — never role names (`OWNER`, etc.).
- Resolution path: `User → user_roles → roles → role_permissions → permissions`, always scoped by JWT `tenantId`.
- `@RequirePermissions(...keys)` uses **AND** semantics (caller must hold every listed key).
- Guards: `JwtAuthGuard` (who) then `PermissionsGuard` (allowed). Auth routes stay without permission gates.
- Smoke surface: `GET /rbac/check` requires `permissions.read` → 200 / 403 / 401; returns `{ ok: true }` only.
- Tenant admin APIs: see [admin-api.md](./admin-api.md) (users, roles, permissions catalog, devices read/revoke, tenant settings)
- Web admin UI: see [web-admin.md](./web-admin.md) (session + permission-aware `/app`)

### Data access (locked)

```
NestJS → TypeORM → Supabase PostgreSQL
```

- **ORM:** TypeORM only (`@nestjs/typeorm` + `typeorm` + `pg`). Do not introduce Drizzle or a second ORM.
- **Schema source of truth:** `supabase/migrations/` — never TypeORM migrations, never `synchronize: true`.
- **Config:** `apps/api/src/db/db.module.ts` connects with `DATABASE_URL` and `synchronize: false`.
  The application must never auto-alter the database schema.
- **Entities:** `apps/api/src/db/entities/` mirrors Phase 1 tables (`tenants`, `permissions`,
  `roles`, `role_permissions`, `users`, `user_roles`, `devices`, `device_users`,
  `refresh_tokens`, `sync_cursors`), including composite PKs/FKs, uniques, indexes,
  defaults, and `onDelete` behavior. CHECK constraints remain Postgres-enforced only.

## Supabase

**Path must be `supabase/migrations/` (plural).** The empty `supabase/migration/` folder
was removed on purpose. The Supabase CLI expects `migrations/`.

| Command | Purpose |
|---------|---------|
| `supabase start` | Local stack |
| `supabase migration new <name>` | Create a new SQL migration |
| `supabase db reset` | Replay migrations + `seed.sql` |

Config: `supabase/config.toml`. Seed: `supabase/seed.sql`.

### Phase 1 schema

Migration `20260811115449_phase1_schema.sql` creates:

`tenants`, `permissions`, `roles`, `role_permissions`, `users`, `user_roles`,
`devices`, `device_users`, `refresh_tokens`, `sync_cursors`.

- Global permission catalog is seeded in that migration (12 Phase 1 keys).
- Tenants, users, and roles are **not** seeded — created at signup (Auth step).
- Junction tables `user_roles` and `device_users` use **composite FKs**
  `(tenant_id, …)` so relationships cannot cross tenants at the DB layer.

### Tenant isolation and RLS (important)

**Primary Phase 1 enforcement is NestJS server-side tenant context**, not Postgres RLS.

- Nest will connect with `DATABASE_URL` (typically the Postgres role used by the API —
  local Supabase `postgres` or a dedicated app role). That connection is **privileged**
  relative to end users: it can read/write all tenants unless the application filters by
  `tenant_id` from the authenticated JWT.
- **Do not** treat “Supabase client with user JWT + RLS” as Phase 1 isolation — the app
  does **not** use Supabase Auth. Client-supplied `tenant_id` must never authorize access.
- RLS policies are **not** enabled in Phase 1 migrations on purpose, to avoid a false sense
  of security while the API uses a service-style connection. If RLS is added later, it must
  be designed for the actual Nest connection role (e.g. `SET LOCAL` request tenant +
  policies), and documented alongside the connection string — not assumed from Supabase Auth.

## Turbo / pnpm commands

From repo root:

```bash
pnpm install
pnpm dev            # all apps (turbo)
pnpm build
pnpm lint
pnpm typecheck
```

### Run one app

| Script | What it runs |
|--------|----------------|
| `pnpm dev:web` | Next.js web on port 3000 |
| `pnpm dev:desktop` | Electron + Vite renderer |
| `pnpm dev:api` | NestJS watch on port 4000 |
| `pnpm build:web` | Next production build |
| `pnpm build:desktop` | electron-vite build |
| `pnpm build:api` | Nest compile to `dist/` |
| `pnpm start:web` | Next production server |
| `pnpm start:api` | Nest production (`start:prod`) |

Equivalent filters: `pnpm --filter @blackbox/web|desktop|api <script>`.

Turbo pipelines: `build` depends on `^build`; `dev` is persistent and uncached.

## Conventions

1. TypeScript strict everywhere (`@blackbox/typescript-config`).
2. Workspace protocol: `"workspace:*"` for internal packages.
3. Never install design-system deps in apps — only in `@blackbox/ui`.
4. Prefer shared ESLint presets from `@blackbox/eslint-config`.
5. Keep secrets out of git (`.env*` ignored; use `.env.example` if needed).

## Gotchas

1. **CSS import once per app** — import `@blackbox/ui/globals.css` in the app entry
   stylesheet, not inside every component.
2. **`@source` paths** — Tailwind v4 needs `@source` pointing at `packages/ui/src` so
   utility classes used in shared components are generated.
3. **Electron ≠ Next** — shared UI must not depend on Next.js.
4. **Supabase folder name** — always `migrations/`, never `migration/`.
5. **Peer React** — apps provide `react` / `react-dom`; UI lists them as peers.
6. **electron-vite outputs** — main/preload/renderer build to `apps/desktop/out/`.
7. **API port** — Nest defaults to `4000` to avoid colliding with Next (`3000`) and
   Supabase API (`54321`).
8. **TooltipProvider** — wrap app trees with `TooltipProvider` from `@blackbox/ui/tooltip`
   when using tooltips or the sidebar component.
9. **UI redesign** — restyle in `packages/ui` only; never duplicate primitives in apps.

## Package map

```
@blackbox/web              apps/web
@blackbox/desktop          apps/desktop
@blackbox/api              apps/api
@blackbox/ui               packages/ui
@blackbox/shared           packages/shared
@blackbox/typescript-config packages/typescript-config
@blackbox/eslint-config    packages/eslint-config
```
