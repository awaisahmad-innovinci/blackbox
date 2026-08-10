# Blackbox

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
| API | `apps/api` | NestJS |

## Packages

| Package | Path |
|---------|------|
| `@blackbox/ui` | `packages/ui` |
| `@blackbox/typescript-config` | `packages/typescript-config` |
| `@blackbox/eslint-config` | `packages/eslint-config` |

## Docs

See [docs/architecture.md](docs/architecture.md) for structure, conventions, and gotchas.
