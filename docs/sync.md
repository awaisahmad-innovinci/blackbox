# Phase 2 bidirectional incremental sync

Cloud (NestJS + Postgres) is the only hub. Devices never sync with each other.

## Identity

- Desktop login (`client: "desktop"` plus `fingerprint`) requires `desktop.access`, binds a `devices` row, and puts `deviceId` on the JWT. See [auth-api.md](./auth-api.md) for the credential and token lifecycle.
- `POST /devices/register` creates/returns a pending device.
- `GET /devices/me` (permission `desktop.access`) reports the calling device's trust state; the desktop shell polls it to show "awaiting approval".
- `POST /devices/:id/trust` (permission `devices.manage`) enables `/sync/*`.
- SQLite path: `{userData}/tenants/{tenantId}/devices/{deviceId}.sqlite` after bind; otherwise `blackbox-local.sqlite`.

## APIs

| Method | Path | Permission |
|--------|------|------------|
| POST | `/sync/push` | `sync.use` |
| GET | `/sync/pull?stream=&cursor=&limit=` | `sync.use` |
| GET | `/sync/status` | `sync.use` |
| POST | `/sync/full-resync-complete` | `sync.use` |
| POST | `/sync/ack-conflicts` | `sync.use` |
| POST | `/sync/retain` | `devices.manage` |

Push body: `{ stream, changes: [{ changeId, entityType, entityId, operation, baseEntityVersion, payload }] }` (max 100 items).

Pull returns `{ changes, nextCursor, hasMore, serverSeq }`. The window is `seq > cursor` for that stream (origin rows included). The client skips apply when `originDeviceId` is itself, then advances `pull_cursor` to `nextCursor` in the same SQLite transaction as apply.

Cloud `sync_cursors` stores the **committed** cursor the device sent, not the delivered head.

## Streams

- `master_data` — LWW via `entity_version` on the change log
- `inventory` — `EVENT` movements; stock is a projection (`delta` or INVENTORY_OUT sign)
- `purchasing` — document UPSERT snapshots
- `auth_snapshot` — reserved (pull-only later)

REST writes also append `sync_changes` (origin = JWT device or per-tenant `cloud-hub` device).

## Tenant scope

Every inventory route is tenant-scoped through `FixedTenantContext`: the JWT tenant when the caller is authenticated, otherwise the `DEV_TENANT_ID` fallback. Rows written by unauthenticated clients therefore land in the fallback tenant and become invisible once the same client signs in. `supabase/scripts/merge-tenant-data.sql` moves such rows to a real tenant and flags the tenant's devices for a full resync.

## Auto sync

The desktop runs [auto-sync.ts](../apps/desktop/src/renderer/src/lib/sync/auto-sync.ts) whenever the session is signed in and the device is trusted:

- once immediately, then every 30s, rescheduled from the end of each attempt so runs cannot stack
- on the `online` event, window focus, and tab visibility, each of which resets the interval
- after every local write, through the `syncNow()` call in the form pages
- on failure the delay doubles up to 5 minutes, and resets to 30s after the next success

While the device is `pending` or its state is unknown, the session polls `GET /devices/me` every 60s so trusting the device in the web admin starts sync without an app restart. A sync that moved rows bumps `dataVersion` in the sync store, which list pages and the dashboard include in their load effects so open screens refresh themselves.

## Local outbox

`local_sync_outbox` + `local_applied_changes` + `local_sync_state`. Business mutation and outbox insert share one SQLite transaction via `sync.commit`.

The desktop signs in on its own sign-in screen, which binds `{tenantId, deviceId}` locally and to the JWT. An admin must `POST /devices/:id/trust` before `/sync/*` succeeds; until then writes stay queued in the outbox and the shell shows a pending-approval banner. Push/pull failures land in the renderer sync store and are shown in the header instead of being swallowed.

Retry of the same `changeId` is a cloud unique `(tenant_id, change_id)` no-op (`duplicate` ack).

## Retention / resync

`POST /sync/retain` (permission `devices.manage`) marks trusted devices silent for 30 days as `needs_full_resync`, then deletes log rows older than 90 days **and** behind every remaining live trusted device cursor.

Full resync: dashboard Sync falls back to REST `runFullPull` when `needsFullResync` is set or no prior pull exists, then advances per-stream cursors to `serverSeq` and calls `POST /sync/full-resync-complete` to clear the flag. Without that call `pull` would keep returning empty pages and incremental sync would never resume.
