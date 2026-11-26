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

Pull returns `{ changes, nextCursor, hasMore, serverSeq }`. The server returns only changes whose `origin_device_id` is **not** the requesting device (other POS devices and the per-tenant `cloud-hub` device for admin REST writes). When only this device's changes exist ahead of the cursor, the server skip-aheads `nextCursor` to the stream tail without transferring payloads. The client still defensively skips apply when `originDeviceId` is itself, then advances `pull_cursor` to `nextCursor` in the same SQLite transaction as apply.

Incremental sync on desktop: **`GET /devices/me`** (device status), read **`local_sync_outbox`** via IPC, **`GET /sync/status`**, then **exits immediately** when the outbox is empty, local pull cursors have caught the per-stream change-log head, and there are no pending local activity logs. Otherwise it may **`POST /sync/push`** (outbox rows only), **`GET /sync/pull`** (streams where the local cursor is behind the stream’s head), and flush pending activity logs. When push or pull touches **`sale`**, **`sale_return`**, **`inventory_out`**, or **`inventory_out_return`**, the desktop reconciles **`inventory_out_items`** from all posted documents (`rebuildPosBalanceFromDocuments`) and bumps `dataVersion`. Header **Sync** is incremental only (outbox + change log).

**Catalog / full pull** (`runFullPull`, forced restore, `needsFullResync`) also downloads operational history through **`GET /sync/catalog`** (`sync.use` only — no separate `sales.read` / `activity.read`):

| Catalog | SQLite tables |
|---------|----------------|
| `documents` kind **`sales`** | `sales`, `sale_lines`, `sale_payments` |
| `documents` kind **`saleReturns`** | `sale_returns`, `sale_return_lines` |
| section **`activityLogs`** | `activity_logs` |
| section **`inventoryMovements`** | `inventory_movements` |

`fullBootstrap: true` clears operational watermarks and page cursors before download. Inventory out **returns** and vendor ledger still hydrate via REST during full pull until catalog covers them.

Cloud `sync_cursors` stores the **committed** cursor the device sent, not the delivered head.

## Streams

- `master_data` — LWW via `entity_version` on the change log
- `inventory` — `EVENT` movements; warehouse `inventory_stock` is a projection from movement `delta` (or INVENTORY_OUT / RETURN sign). **`SALE` and `SALE_RETURN` movements are audit-only** — they do not change warehouse stock; floor qty is updated by `sale` / `sale_return` entity UPSERTs (`inventory_out_items` balance).
- `purchasing` — document UPSERT snapshots
- `auth_snapshot` — reserved (pull-only later)

**POS floor balance (`inventory_out_items`)** is not a sync entity. Cloud and each device derive it from posted **`inventory_out`**, **`inventory_out_return`**, **`sale`**, and open **`sale_return`** lines. After sync push or REST post of any of those documents, the API runs the same document-based reconcile (`rebuildInventoryOutBalanceFromDocuments`) so concurrent offline cashier sales converge on one quantity. Catalog **full pull** imports **sales** via catalog documents, then rebuilds POS balance once at the end.

REST writes also append `sync_changes` (origin = JWT device or per-tenant `cloud-hub` device).

## Tenant scope

Every inventory route is tenant-scoped through `FixedTenantContext`: the JWT tenant when the caller is authenticated, otherwise the `DEV_TENANT_ID` fallback. Rows written by unauthenticated clients therefore land in the fallback tenant and become invisible once the same client signs in. `supabase/scripts/merge-tenant-data.sql` moves such rows to a real tenant and flags the tenant's devices for a full resync.

## Auto sync

The desktop runs [auto-sync.ts](../apps/desktop/src/renderer/src/lib/sync/auto-sync.ts) whenever the session is signed in and the device is trusted:

- once immediately, then every 60s, rescheduled from the end of each attempt so runs cannot stack
- on the `online` event, window focus, and tab visibility, each of which resets the interval
- after every local write, through the `syncNow()` call in the form pages
- on failure the delay doubles up to 5 minutes, and resets to 60s after the next success

While the device is `pending` or its state is unknown, the session polls `GET /devices/me` every 15s (plus on window focus and when the browser goes online) so trusting the device in the web admin unlocks the shell and starts sync without an app restart. A sync that moved rows bumps `dataVersion` in the sync store, which list pages and the dashboard include in their load effects so open screens refresh themselves.

## Local outbox

`local_sync_outbox` + `local_applied_changes` + `local_sync_state`. Business mutation and outbox insert share one SQLite transaction via `sync.commit`.

After a **forced restore** (wipe + `runFullPull` + cash ledger) or a dashboard **full pull**, the outbox should stay **empty**: cloud data lands in business tables only. The desktop sets `sync_meta` `till_sync_backfill_v1` so the legacy one-shot till outbox backfill (`enqueueExistingTillsOnce` on `listOutbox`) does not treat restored till sessions as new local pushes. Only new `sync.commit` calls add outbox rows.

The desktop signs in on its own sign-in screen, which binds `{tenantId, deviceId}` locally and to the JWT. An admin must `POST /devices/:id/trust` before `/sync/*` succeeds. Until then the shell shows a full-screen lock (sign out only), local writes via `sync.commit` are rejected, and SQLite is not wiped. Push/pull failures land in the renderer sync store and are shown in the header instead of being swallowed.

Retry of the same `changeId` is a cloud unique `(tenant_id, change_id)` no-op (`duplicate` ack).

## Retention / resync

`POST /sync/retain` (permission `devices.manage`) marks trusted devices silent for 30 days as `needs_full_resync`, then deletes log rows older than 90 days **and** behind every remaining live trusted device cursor.

Full resync: dashboard Sync falls back to REST `runFullPull` when `needsFullResync` is set or no prior pull exists, then advances per-stream cursors to `serverSeq` and calls `POST /sync/full-resync-complete` to clear the flag. Without that call `pull` would keep returning empty pages and incremental sync would never resume.

After a **revoke wipe**, forced restore runs `runFullPull` (catalog), then **`GET /sync/cash-ledger`** (paginated snapshot of owner cash, manager drawer openings/submissions, cash expenses, till sessions, and till withdrawals into SQLite), then **incremental sync** before the shell unlocks. That keeps manager drawer balances aligned with the web owner dashboard even when old rows are no longer in the sync change log.

REST full pull does **not** replay the sync change log, so `local_entity_versions` would stay stale without a follow-up **`GET /sync/entity-version-heads`** (streams `master_data` and `purchasing`). The desktop seeds those heads after full pull, master-data import pull, and full-resync-complete. Push uses `baseEntityVersion` from `local_entity_versions` at commit time.

Desktop creates must reuse the same entity UUID as CSV/cloud rows (match keys: `vendor_code`, taxonomy `name`, `sku`, warehouse `code`, etc.) via `resolveCanonicalEntityId` before `sync.commit`.
