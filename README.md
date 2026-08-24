# Blackbox ( staging )

pnpm + Turborepo monorepo with Next.js (web), Electron + Vite + React (desktop), NestJS (api), and a shared `@blackbox/ui` design system.

## Quick start

```bash
pnpm install
pnpm dev
```

## Run apps separately

| Command | App |
|---------|-----|
| `pnpm dev:web` | Next.js web (`http://localhost:3000`) |
| `pnpm dev:desktop` | Electron desktop |
| `pnpm dev:api` | NestJS API (`http://localhost:4000`) |

Build / start:

```bash
pnpm build:web
pnpm build:desktop
pnpm build:api
pnpm start:web
pnpm start:api
```

## Apps

| App | Path | Stack |
|-----|------|--------|
| Web | `apps/web` | Next.js App Router |
| Desktop | `apps/desktop` | Electron + Vite + React |
| API | `apps/api` | NestJS + TypeORM → Supabase Postgres |

## Packages

| Package | Path |
|---------|------|
| `@blackbox/ui` | `packages/ui` |
| `@blackbox/shared` | `packages/shared` |
| `@blackbox/typescript-config` | `packages/typescript-config` |
| `@blackbox/eslint-config` | `packages/eslint-config` |

## Environment

Copy example env files (never commit real secrets):

| App | Example | Local file |
|-----|---------|------------|
| API | `apps/api/.env.example` | `apps/api/.env` |
| Web | `apps/web/.env.example` | `apps/web/.env.local` |
| Desktop | `apps/desktop/.env.example` | `apps/desktop/.env` |

Phase 1 defaults: access token 15m, refresh token 7d, offline authorization 7d.

## Docs

See [docs/architecture.md](docs/architecture.md) for structure, conventions, and gotchas.
