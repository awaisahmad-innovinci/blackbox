# Blackbox — Codebase Review (Doc 1 of 2)

| | |
|---|---|
| **Scope** | `apps/api`, `apps/desktop`, `apps/web`, `apps/platform`, `packages/shared`, `packages/ui`, `supabase/migrations` |
| **Checked against** | [Blackbox - prd.csv](./Blackbox%20-%20prd.csv) and the store data in [sampleData/](./sampleData/) |
| **Date** | 16 Nov 2026 |
| **Next doc** | [ux-ui-review.md](./ux-ui-review.md) (UX and UI) |
| **Replaces** | [qa-report.md](./qa-report.md) (some of it is now out of date) |

**Rule for every fix below:** keep the business rules as they are. The fixes make the code do what
the rules already say. Where the PRD asks for something that is not built yet, it is listed as
**Missing**. It is not redesigned here.

---

## 0. Summary

**Verdict: not ready for production.** The app has a lot of features and a clean monorepo. But:

- Cashiers can get the managers' approval codes, so every approval can be faked.
- The server trusts the prices the till sends.
- Posting a sale on the till is not one safe step, so a power cut can leave cash and stock wrong.
- There are no tests.

| Priority | Meaning | Count |
|---|---|---|
| **P0** | Blocker. Data leak, money loss or abuse. Fix first. | 15 |
| **P1** | High. Fix before launch. | 25 |
| **P2** | Medium. Plan it. | 18 |
| **P3** | Low. Cleanup. | 4 |

### Fix these 10 first

1. **S1:** Stop sending manager TOTP secrets to tills.
2. **S2:** The server must check approval codes.
3. **M1:** The server must work out prices itself. It must not trust the till.
4. **S6:** Lock down the 13 open inventory and purchasing APIs.
5. **S3, S4:** One shop can change roles and delete sync data for **all** shops.
6. **S5:** Sync push must check permissions and validate data.
7. **D1:** Post a sale on the till in one transaction.
8. **M3:** Return GST is always 0, so the FBR tax report is wrong.
9. **FR-POS-007:** A reprint opens the cash drawer. The PRD says it must not.
10. **A9:** Add tests and CI for money, stock and tax.

---

## Fix pass 1: status (16 Nov 2026)

These are small fixes that keep the current behaviour. The business rules are unchanged.

| ID | Status | What changed |
|---|---|---|
| **S6** | ✅ Fixed | All 13 open controllers (plus skus and dashboard) now need a login. Reads are open to any logged-in user. Writes need `inventory.access`, `vendors.access` or `purchasing.access`, matching the desktop menus. |
| **S7** | ✅ Fixed | `FixedTenantContext` has no fallback. With no JWT tenant it returns 401. |
| **S3** | ✅ Fixed | Tenant `POST/PATCH/PUT /roles` returns 403. Only the platform console edits the shared roles. Web hides the edit buttons. |
| **S4** | ✅ Fixed | `POST /sync/retain` only touches the caller's tenant. |
| **S17** | ✅ Fixed | All `#region agent log` telemetry was removed from the API and desktop, and `debug-input-freeze.ts` was deleted. |
| **M3** | ✅ Fixed | Return GST is split out of line prices, the same way as sales (`saleReturnBillTotals`). The refund amount is unchanged. |
| **FR-POS-007** | ✅ Fixed | The drawer opens on the first receipt after posting. The reprint Print button no longer opens it. |
| **M1** | 🟡 Partial | Price mismatches are **logged** (`sale-price-check.ts`) on both the REST and sync paths. Sales are not rejected yet. |
| **I1, I2, I3** | ✅ Fixed | The importer matches headers by name (case, spaces and extra columns are fine), maps label values (`Stock Item`, `Bill to bill`), and skips all-blank rows. |
| **S9** | ✅ Fixed | Login, forgot and reset allow 10 tries per minute per login name (in memory, per API process). |
| **S10** | 🟡 Partial | Helmet added and `apps/api/.env.example` added. The global exception filter is not done yet. |
| **A9** | 🟡 Started | `packages/shared` has tests (`pnpm test`). The new `.github/workflows/ci.yml` runs typecheck, lint (all apps except desktop) and tests. |
| — | ✅ | The API now passes lint (unused imports and a useless try/catch removed). |

**Deferred (next passes):**
- S1/S2: offline approval redesign, as its own task.
- S5, S8: sync push permissions, audit log POST.
- D1–D13: atomic till posting, row locks, number sequences, void, negative stock, sync outbox.
- M2, M4–M8: one money helper, box pricing, time zone, cash rounding.
- A1–A19: structure.
- Desktop lint: 23 issues that were already there.
- UX doc items.

---

## 1. How the system fits together

```
 Desktop POS (Electron)                     Web admin (Next.js)   Platform console (Next.js)
 ┌──────────────────────────────┐                 │                       │
 │ Renderer (React)             │                 │  HTTPS + JWT          │
 │   │  IPC (171 channels)      │                 ▼                       ▼
 │ Main process                 │  push/pull  ┌───────────────────────────────┐
 │   SQLite (better-sqlite3)    │ ──────────► │ API (NestJS + TypeORM)        │
 │   outbox → sync              │ ◄────────── │   sync, sales, tills, stock…  │
 └──────────────────────────────┘             └──────────────┬────────────────┘
                                                             ▼
                                              Supabase Postgres (66 migrations)
```

The design is sound: offline-first till, a sync outbox, tenant comes from the JWT, and the schema
lives only in migrations. Most of the problems are in **who is trusted** and **what happens when
two things run at the same time**.

---

## 2. Security and tenant isolation

| ID | Pri | Problem | Where | Fix |
|---|---|---|---|---|
| **S1** | P0 | Any user with `sync.use` (cashiers have it) can download **every manager's TOTP secret**. The cashier can then make any manager's approval code. | `apps/api/src/auth/totp/totp.controller.ts:68-77`, `totp.service.ts:187-223`; cashier seed `packages/shared/src/seeds.ts:16-22` | Never send secrets. For offline use, send one-time codes per device (HMAC of device + time window) or signed approval tokens. Remove the `supervisor-cache` route. |
| **S2** | P0 | The server never checks supervisor codes. A manager's user id alone approves FOC, till funding and withdrawals. | `apps/api/src/sales/sales.service.ts:425-431`, `apps/api/src/tills/tills.service.ts:125-130, 324, 362, 527, 785-795` | Require `supervisorCode` in the DTO and verify it in the service, inside the same transaction. |
| **S3** | P0 | Roles became global (no `tenant_id`), but tenant admins can still edit them. One shop owner can change MANAGER or CASHIER rights for **every** shop. | `apps/api/src/roles/roles.service.ts:118-151`; `supabase/migrations/20261112150000_global_roles.sql` | Let only the platform admin edit global roles. Tenant custom roles get their own tenant-scoped rows. |
| **S4** | P0 | `POST /sync/retain` deletes sync history for **all** tenants, using cursors from other tenants. Devices can lose changes or be forced into a full resync. | `apps/api/src/sync/sync.service.ts:421-463`, `sync.controller.ts:98-102` | Filter by `tenant_id` on devices, cursors and the delete. Run it as a cron job, not a public route. |
| **S5** | P0 | Sync push only needs `sync.use`. A till can then write products and prices, POs, vendor ledger, till balance (`currentCashBalance`) and any stock adjustment. It copies the raw payload onto entities (`Object.assign`). | `sync.service.ts:489-600, 668-1096, 678-733, 2233-2260` | Map each entity type to a permission. Validate each payload with a DTO. Allow only known fields. |
| **S6** | P0 | The global guard is *optional* JWT. 13 controllers have no guard and no permission: brands, categories, units, products, vendors, vendor-groups, vendor-skus, purchase-orders, goods-receipts, inventory-out, inventory-out-returns, vendor-returns, master-data-import. Any logged-in user (including a cashier) has full access, and anonymous calls give 500 errors. Also only partly guarded: `skus.controller.ts:130-194`, `dashboard.controller.ts:39, 66`, `sales.controller.ts:46, 74`. | `apps/api/src/app.module.ts:54`, `auth/optional-jwt-auth.guard.ts:17-19`, the controllers above | Make `JwtAuthGuard` + `PermissionsGuard` the global default. Mark only login, refresh, forgot and health `@Public()`. Add `@RequirePermissions(...)` to every route (keys already exist in `packages/shared/src/permissions.ts`). |
| **S7** | P0 | `FixedTenantContext` reads the request at construction time, so the tenant is always undefined. It also has an unused `ConfigService` and the only `any` in the API. 25 files use it. | `apps/api/src/inventory/common/fixed-tenant.context.ts:12-16` | Delete it. Use `@CurrentUser()` (`tenantId` from the JWT) everywhere. |
| **S8** | P0 | Anyone can POST an activity log entry naming any manager as the actor or supervisor. The audit log can be faked. | `apps/api/src/activity-log/activity-log.service.ts:74-83`, `activity-log.controller.ts:28` | Remove the public POST. Write audit rows only on the server, inside the business transaction. |
| **S9** | P1 | No rate limit on login, refresh, forgot or reset. The 6-digit reset code has no attempt counter. | `apps/api/src/auth/auth.controller.ts:27-53`, `auth/password-reset.service.ts:73-118` | Add `@nestjs/throttler` (for example 5 per minute on auth). Lock a reset code after 5 bad tries. |
| **S10** | P1 | No `helmet`, no global exception filter (raw errors reach clients), no `apps/api/.env.example`. | `apps/api/src/main.ts:7-27` | Add helmet, one global filter (safe message out, full detail in the log), and an `.env.example`. CORS is already fixed. |
| **S11** | P1 | Platform has one shared operator login from env, with no MFA and no record of who did what. The API returns the owner's **plain password** to the browser. | `apps/api/src/platform/platform.service.ts:46-67, 130`; `apps/platform/src/components/tenant-management.tsx:186-192, 519` | Give each operator an account, add TOTP and a platform audit log. Send a one-time reset link instead of echoing a password. |
| **S12** | P1 | Desktop trusts the renderer. Permissions and approval flags come from `localStorage`. Editing them unlocks `till.manage`, which skips all till checks. | `apps/desktop/src/renderer/src/app/session-context.tsx:41-60`, `features/sales/SalePage.tsx:206-208, 1277`, `main/db/till-local.ts:941, 983` | Keep a signed session snapshot in the main process. Check permissions and approvals in main, not in React. |
| **S13** | P1 | Desktop stores TOTP secrets in plain SQLite, and the renderer can overwrite them (`localDb:replaceSupervisorTotp`). A code can be reused for about 90 seconds. | `apps/desktop/src/main/db/supervisor-totp-local.ts:10-35`, `main/index.ts:1213-1222`, `totp-verify.ts:52` | Goes away with S1. Until then, encrypt with `safeStorage`, make the replace main-only, and remember used codes. |
| **S14** | P1 | 171 IPC channels with no input checks and no sender check. These include `localDb:wipe`, `sync:commit` and `identity:bind`. `sandbox: false`. `shell.openExternal` opens any URL (`file:`, `smb:`). | `apps/desktop/src/main/index.ts:279, 291-294, 305-1228`; `src/preload/index.ts` | Turn on `sandbox: true`. Allow only `https:` in `openExternal` and block navigation. Validate IPC input with zod. Check `event.senderFrame.url`. Turn off DevTools in packaged builds. |
| **S15** | P1 | The OTA update feed URL comes from an API response. Builds are not signed (no `publisherName`). | `apps/desktop/src/main/silent-update.ts:12-20`, `apps/desktop/electron-builder.yml:23-25` | Hard-code an HTTPS feed. Sign Windows builds. Verify signatures. |
| **S16** | P2 | The web owner's refresh token (7 days) is kept in `localStorage`. | `apps/web/src/lib/auth-storage.ts:8, 27-37` | Move it to an httpOnly cookie through a Next route handler. Until then, keep a strict CSP. |
| **S17** | P1 | Debug telemetry is left in production code and posts tenant and sale ids to a local endpoint. | `apps/api/src/sync/sync.service.ts:2043, 2127`, `fbr/fbr.service.ts:93`, `cash-flow/cash-flow.service.ts:432, 436, 552`; `apps/desktop/src/renderer/src/lib/debug-input-freeze.ts`, `components/confirm-dialog.tsx` (`// #region agent log`) | Delete all of it. Add a lint rule that blocks `127.0.0.1:7` style fetches. |

---

## 3. Money and tax logic

| ID | Pri | Problem | Where | Fix |
|---|---|---|---|---|
| **M1** | P0 | The server takes `unitPrice`, `lineTotal`, `gstPercent` and `discountPercent` from the client and never checks them against the SKU. Merged duplicate lines keep the first line's price. | `apps/api/src/sales/sales.service.ts:374-421` | Load the SKU and barcode multiplier and compute the line on the server. `saleLineTotal` / `lineTotalForScan` in `packages/shared/src/sales.ts` already exist (`saleLineTotal` has no callers). Reject a sale if the client total differs. |
| **M2** | P1 | All money is JS float with `Math.round(n*10000)/10000`. The helper is copied into about 28 files (20 in the API, 12 in desktop). Values like 1.005 round wrong. | `packages/shared/src/inventory.ts:929` (`roundMoney4`), `sales.ts:188`; copies e.g. `apps/api/src/sales/sales.service.ts:60`, `tills.service.ts:43`, `fbr/fbr.service.ts:46` | Keep **one** money helper in shared (integer paisa or `decimal.js`). Delete the copies and add a lint ban on new `round4` functions. |
| **M3** | P0 | Return GST is always 0, because it uses `sale.gstRate`, which is always 0. Net GST in the FBR tax report is too high. Return subtotal includes GST but sale subtotal does not. | `apps/api/src/sales/sale-returns/sale-returns.service.ts:358`, `sales.service.ts:440`, `tax-reports/tax-reports.service.ts:409-421` | Compute return GST per line, the same way as sales. Store subtotal on the same basis (excluding GST) for both. |
| **M4** | P1 | Inclusive-price mode always returns `salesTaxAmount: 0`, so sales tax silently disappears. | `packages/shared/src/sales.ts:192-230` | Make the tax mode one explicit tenant setting and use one function per mode. Add tests. |
| **M5** | P1 | When a box barcode is scanned, the quantity is multiplied but the **piece** price is used. `sellingPricePerPurchaseUnit` is used only when the piece price is 0. `sellUnit` flips to whatever was scanned last. | `apps/desktop/src/renderer/src/features/sales/SalePage.tsx:114-122, 711-733` | Price at the scanned unit, or keep box and piece as separate lines. |
| **M6** | P1 | Dates use UTC. Between 00:00 and 05:00 PKT, documents and reports fall on the previous day. | API `cash-flow.service.ts:323`, `tax-reports.service.ts:421`; desktop `SaleReturnFormPage.tsx:52`, `DashboardPage.tsx:190, 224`, `InventoryOutPage.tsx:51` (+5) | One shared `businessDay(date, tz)` helper. In SQL use `AT TIME ZONE 'Asia/Karachi'` (or the tenant timezone). |
| **M7** | P2 | No cash rounding. The receipt shows 2 decimals and the database stores 4. Cash expense is saved unrounded. | `packages/shared/src/inventory.ts:938`, `apps/desktop/.../SalePage.tsx:409-427`, `cash-flow.service.ts:183` | Round the bill to Rs 1 (or a set step) with a visible "rounding" line. Store what is printed. |
| **M8** | P2 | `formatMoney` uses the browser locale. "Rs" is hard-coded in web. `maxCashTender` assumes 5000-rupee notes. | `packages/shared/src/inventory.ts:938`, `sales.ts:237`; `apps/web/src/app/app/page.tsx:84` | Pass the tenant currency and locale (`Intl.NumberFormat`). |

---

## 4. Data integrity and concurrency

| ID | Pri | Problem | Where | Fix |
|---|---|---|---|---|
| **D1** | P0 | Posting a sale on the till is about 5 separate IPC calls (sale, movements, till cash, return completion, log). A crash halfway leaves the sale posted but the till cash wrong. A refund takes cash out **before** the return is completed. | `apps/desktop/src/renderer/src/features/sales/SalePage.tsx:1368-1462`, `features/sales/SaleReturnRefundPage.tsx:79-97` | One main-process `pos:postSale` (and `pos:refund`) that does everything plus the outbox in **one** `db.transaction`. |
| **D2** | P0 | `removeStaleSaleByNumber` deletes any local sale with the same number, **even if not synced yet**. After a re-bind, a reused number can silently delete a real sale. | `apps/desktop/src/main/db/sales-local.ts:7-52, 129`, `document-counters-local.ts:42-73` | Never delete `sync_status='local'` rows. Flag the clash and renumber. |
| **D3** | P0 | Race conditions. The check happens outside the lock, so two requests can both pass:<br>• till cash balance (lost update): `tills.service.ts:631-645, 696-703`<br>• till open, withdraw, collect: `tills.service.ts:181-251, 440-494, 706-820`<br>• cash-flow expense and submit: `cash-flow.service.ts:152-309`<br>• vendor payment: `vendor-ledger.service.ts:208-238`<br>• return voucher used twice: `sales.service.ts:447-460`<br>• over-return: `sale-returns.service.ts:262-292`<br>• double refund: `sale-returns.service.ts:543-587` | Do check and write inside one transaction, with `SELECT … FOR UPDATE` on the parent row, or an atomic `UPDATE … SET x = x + $1 WHERE … RETURNING`. For vouchers, update `WHERE status='PENDING'`. |
| **D4** | P1 | Document numbers come from 3 different methods. One reads **all** previous numbers (slow), and one locks only an existing row. Two posts at once hit the unique key and get a 500. | `apps/api/src/inventory/common/allocate-document-number.ts:20-81`, `sales.service.ts:876-891`, `sale-returns.service.ts:795-810`, `inventory-out-returns.service.ts:391-413`; desktop `document-counters-local.ts:28-50` | One `document_sequences(tenant_id, doc_type, prefix, next)` table with `UPDATE … RETURNING`. Desktop: use the counter row only and run the floor check once at bind time. |
| **D5** | P1 | Void is incomplete. No stock reversal movement, no till cash reversal, no audit row, no check for existing returns (stock can come back twice), no FBR handling. | `apps/api/src/sales/sales.service.ts:752-801` | Do all five in the void transaction. Block void if a return exists. |
| **D6** | P1 | Negative stock is possible:<br>• no DB guard (`inventory_stock` has no CHECK)<br>• an offline sale at zero stock is accepted through sync with **no** deduction and no movement row<br>• the sync stock update is not row-locked against REST writes. | `supabase/migrations/20260817112600_inventory_phase1.sql:190-201`; `apps/api/src/sync/sync.service.ts:712-731, 1989-2030, 2132-2193` | Add `CHECK (quantity_on_hand >= 0)`. For offline oversell, follow the PRD rule (block at the till). If one still reaches the server, record it in an "exceptions" list and always write the movement. Lock the stock row. |
| **D7** | P1 | Sync engine gaps:<br>• change events are published in a separate transaction (`sync-change.subscriber.ts:71-81`), so rolled-back writes still sync<br>• `publishFromRest` after commit can be lost (`inventory-out.service.ts:316-321`)<br>• duplicate-push check runs before the lock (`sync.service.ts:497-506`)<br>• void branch can never run (`:1175-1181, 2210-2230`)<br>• a `sale_return` checks for status "POSTED", which doesn't exist (`:1183-1189`)<br>• sync returns don't check sold quantity (`:1859-1977`)<br>• desktop outbox is ordered by a 1-second timestamp (`outbox-local.ts:72-79`)<br>• one bad pulled record blocks the whole pull forever (`sync-apply.ts:604-625`)<br>• rejected sales are silent (`api/sync.ts:178-189`) | Write sync changes **inside** the business transaction (transactional outbox). Move the duplicate check under the lock. Fix the status checks. Reuse the REST return checks. Add an autoincrement `local_seq`. Quarantine bad pulled records instead of throwing. Show a "Not synced" screen to the manager. |
| **D8** | P1 | Managers selling skip the till (`skipForManager`), so their cash goes into no drawer. `applyCashRefund` hides shortfalls with `max(…, 0)`. | `apps/api/src/tills/tills.service.ts:596, 629, 670, 702`; desktop `SalePage.tsx:1277, 1459`, `till-local.ts:941` | Every cash sale belongs to an open till session. Remove the bypass and the clamp. |
| **D9** | P2 | Soft delete:<br>• a plain `@Column` instead of `@DeleteDateColumn`, so filtering is manual and missing in many places<br>• PATCH can revive a deleted row<br>• restore works differently per module<br>• `getById` returns deleted rows<br>• sync can overwrite `deletedAt` and `status`. | e.g. `apps/api/src/db/entities/brand.entity.ts:34`, `inventory/brands/brands.service.ts:73-109`, `users/users.service.ts:204-210`, `skus.service.ts:243`, `sync.service.ts:2254-2259` | Use `@DeleteDateColumn`. Reject updates on deleted rows. Make restore the same everywhere. Don't let sync set these fields. |
| **D10** | P2 | A goods receipt marks the PO RECEIVED even after a partial delivery. Average cost ignores bonus quantity. | `apps/api/src/inventory/goods-receipts/goods-receipts.service.ts:275-286, 567-577, 622` | Track received quantity per PO line. Close the PO only when all lines are received. Include bonus quantity in average cost (as zero-cost units). |
| **D11** | P2 | Vendor balance is clamped with `max(0)`, so overpayment is hidden. | `apps/api/src/vendor-ledger/vendor-ledger.service.ts:320-329` | Show negative (advance) balances as they are. |
| **D12** | P2 | The `saleNumber` DTO uses `@IsString() @Min(1)`, so any sent value fails with a 400. | `apps/api/src/sales/dto/sale.dto.ts:97-100` | `@MinLength(1)`. |
| **D13** | P2 | Held bills reserve stock forever, live only on one device and never sync. | `apps/desktop/src/main/db/sales-local.ts:268-325` | Expire holds (for example at end of shift) and show held quantity in stock views. |

---

## 5. Code structure and architecture

| ID | Pri | Problem | Where | Fix |
|---|---|---|---|---|
| **A1** | P1 | God files that are too big to review safely:<br>• `SalePage.tsx` 2430 lines (about 30 `useState`, 3 keyboard systems, online and offline post, till, FOC, returns, card)<br>• `sync.service.ts` 2409<br>• `entity-get-local.ts` 2039<br>• `queries-local.ts` 1977<br>• desktop `main/index.ts` 1276 (161 inline `ipcMain.handle`)<br>• `master-data-import.service.ts` 1519<br>• platform `tenant-management.tsx` 696 | the files above | Split by use case:<br>• SalePage → `useSaleCart`, `useScanner`, `PaymentPanel`, `TillBar`, `postSale` service<br>• sync → one handler file per entity<br>• main IPC → one `register-*-handlers.ts` per domain (`register-pos-handlers.ts` already follows this pattern) |
| **A2** | P1 | Sync re-implements the business rules for sales, goods receipts (including average cost), returns and tills, separately from the REST services. The two copies already behave differently. | `apps/api/src/sync/sync.service.ts:1032-2231` | The sync handlers call the **same** domain service methods as REST. One rule, one place. |
| **A3** | P1 | Every write page on desktop has two post paths (local vs online API). | `SalePage.tsx:1309-1518` vs `1520-1579`, `SaleReturnFormPage.tsx:244-332` vs `334-376` | One path: always write locally, and the outbox syncs. Online-only mode becomes "sync right away". |
| **A4** | P1 | The same API client is written 3 times (web, platform, desktop): 3 `ApiError` classes, 2 refresh flows, different error text. Endpoint modules and DTOs are copied too. | `apps/web/src/lib/api-client.ts`, `apps/platform/src/lib/api.ts:24-80`, `apps/desktop/src/renderer/src/lib/api/client.ts:18-140`; local DTOs `apps/web/src/lib/admin-api.ts:12-80, 293-300` | New `packages/api-client` with `createApiClient({ baseUrl, tokenStore })` plus typed endpoints. All DTOs come from `@blackbox/shared`. |
| **A5** | P2 | Tenant scoping is done 3 ways: `FixedTenantContext` (25 files), `getRequestTenant()` (13), `@CurrentUser()` (14). | `apps/api/src/**` | Use `@CurrentUser()` only (see S7). |
| **A6** | P2 | Folder layout is confusing:<br>• `rbac/`, `roles/` and `permissions/` are 3 modules for one job<br>• two `common/` folders<br>• purchasing, vendors, dashboard and imports sit under `inventory/`<br>• returns are nested in one place and siblings in another | `apps/api/src/` | Group by domain: `access/` (rbac + roles + permissions), `catalog/`, `purchasing/`, `stock/`, `sales/`, `cash/`, `sync/`, `platform/`. Keep one `common/`. Move files only; logic stays the same. |
| **A7** | P2 | Duplicated helpers:<br>• `toNum` and `round4` in about 20 API files<br>• pagination math in 15 services<br>• `fullName ?? username` 30 times in desktop<br>• `groupKey()` 3 times | across apps | One `paginate()` in API common. Shared `displayName(user)`. `PERMISSION_GROUPS` in `packages/shared/src/permissions.ts`. |
| **A8** | P2 | Report pages are copied between web and desktop (inventory in/out 560 vs 583 lines, tax 409 vs 335). ConfirmDialog is forked. Web builds its own DataTable, which breaks the "UI only in `packages/ui`" rule. | `apps/web/src/app/app/inventory/reports/page.tsx` vs `apps/desktop/src/renderer/src/features/inventory/InventoryInOutReportPage.tsx`; `apps/web/src/components/confirm-dialog.tsx`, `data-table.tsx` | Move the shared report bodies into a shared package. Move ConfirmDialog and Table into `@blackbox/ui`. |
| **A9** | P0 | **Zero tests** (`*.spec.ts` / `*.test.ts`). CI only mirrors to GitHub (`bitbucket-pipelines.yml`) and builds desktop on `staging` (`.github/workflows/build-desktop.yml`). | repo-wide | 1) vitest for `packages/shared` money, tax, till and number formulas. 2) API integration tests for posting a sale, void, return and refund, goods receipt, inventory out, and sync push/pull. 3) A CI job on every PR: `pnpm typecheck && pnpm lint && pnpm test`. |
| **A10** | P1 | No runtime validation of API responses (`body as T`) or sync payloads (`Record<string, unknown>` with `Number()`/`String()`). | `apps/web/src/lib/api-client.ts:174`, `apps/platform/src/lib/api.ts:79`, `apps/api/src/sync/sync.service.ts` (33 places), `apps/desktop/src/main/db/sync-apply.ts` | zod schemas in shared for sync payloads and key DTOs. zod is already installed (in `packages/ui`). |
| **A11** | P1 | OTA risk. The update installs on quit even if the outbox still has unsynced sales. Migrations run with no backup. | `apps/desktop/src/main/silent-update.ts:35-36`, `main/db/migrations.ts:1594-1602` | `VACUUM INTO` a backup before migrations. Install only when the outbox is empty. Roll out in stages. |
| **A12** | P2 | `packages/shared` is CJS-only with re-bound constants as a "Vite interop" workaround. Desktop `env.d.ts` (557 lines) hand-copies the preload API. | `packages/shared/src/index.ts:301-330`, `apps/desktop/src/renderer/src/env.d.ts` | Ship ESM pointing at `src` (as `packages/ui` does) and delete the re-bindings. Export the preload type with `typeof api`. |
| **A13** | P2 | Performance:<br>• `ensureCounterFloor` scans every sale number on each new number<br>• the legacy barcode lookup (`product_skus.barcode`) has no index<br>• the web dashboard downloads all users and devices just to count them<br>• the inventory report filters on the client. | `apps/desktop/src/main/db/document-counters-local.ts:28-50`, `sku-barcodes-local.ts:117-124`; `apps/web/src/app/app/page.tsx:107-122`, `inventory/reports/page.tsx:97, 126` | Floor check once at bind time. Add an index on `product_skus(tenant_id, barcode)`. Put counts in `/owner-overview`. Filter and page on the server. |
| **A14** | P2 | No fetch timeout on desktop. The FBR submit runs **before** the receipt is shown, so the cashier waits on a slow network. | `apps/desktop/src/renderer/src/lib/api/client.ts:114`, `SalePage.tsx:1496-1515` | `AbortController` with about 3 seconds. Show the receipt first and send FBR in the background queue (the PRD already says to queue on fiscal loss). |
| **A15** | P2 | The till trusts the local clock. Nothing records server time offset, which affects TOTP, `postedAt` and ordering. | desktop sync | Store the server time offset on each sync. Warn when the skew is more than 2 minutes. |
| **A16** | P3 | Two hooks disable `exhaustive-deps`. 36 `as unknown as` casts in desktop. 418 `as` casts. | `list-pagination.tsx:96`, `SkuProfilePage.tsx:164` | Review case by case. Typed outbox payloads remove most casts. |
| **A17** | P3 | Dev server is open to the network (`host: true` plus ngrok hosts). The production CSP still allows `ws://localhost:5173`. | `apps/desktop/electron.vite.config.ts:47-53`, `renderer/index.html:5-8` | Make both opt-in by env. Use a build-specific CSP. |
| **A18** | P3 | Platform `.env` has an unused `OFFLINE_AUTHORIZATION_DAYS`. There is no platform `.env.example`. Platform silently falls back to `localhost:4000`. | `apps/platform/.env`, `apps/platform/src/lib/api.ts:35` | Remove the variable, add the example file, and fail the build if `NEXT_PUBLIC_API_URL` is missing. |
| **A19** | P3 | No structured logs or request ids. | API-wide | Add `nestjs-pino` with a request id once live. |

---

## 6. Sample data and import (your supermarket data)

I loaded every file in `docs/sampleData/` and checked it against the importer
(`apps/api/src/inventory/imports/master-data-import.service.ts`).

### 6a. Importer problems (code)

| ID | Pri | Problem | Where | Fix |
|---|---|---|---|---|
| **I1** | P0 | **Your SKU file will be rejected as a whole.** The header must match exactly, but your file has `" variant_name"` (leading space) and `"HS Code"` (expected `hs_code`). | `master-data-import.service.ts:106-113` | Trim headers, compare them case-insensitively, and accept known aliases (`HS Code` → `hs_code`). |
| **I2** | P1 | `product_type` must be `STOCK_ITEM`. All 363 of your products say `Stock Item`, so every row fails. | `:523` | Accept the label form too (`Stock Item` → `STOCK_ITEM`) using `PRODUCT_TYPE_LABELS`, which already exists in shared. |
| **I3** | P1 | **Silent data loss.** An unknown optional value is quietly set to empty. All 176 vendors with `Bill to bill` lose their payment terms with no error. | `enumValue()` `:1341-1347` | Map labels (`Bill to bill` → `BILL_TO_BILL`, using `PAYMENT_TERMS_LABELS`). If a value is still unknown, show a **warning row**. Never drop it silently. |
| **I4** | P2 | No preview or dry run. One bad row rolls back the whole file, which is good, but you only find out after uploading. | import controller | Add `?dryRun=true` that returns all errors and warnings without saving. |
| **I5** | P2 | Still uses `FixedTenantContext` and the route has no guard. | import controller + service | Covered by S6 and S7. |

### 6b. Data clean-up list for the store team

| File | Issue | Count |
|---|---|---|
| 01_units | One blank row. Only `Pcs`, `Btl`, `Box` exist, and no weight units (`kg`, `g`) even though grocery sells loose items. | 1 row |
| 02_brands | Brands used in products but missing here (e.g. Choci Toki, Candy Shandy, Trident, Vienna, Savoria). | 10+ |
| 04_warehouses | **Empty.** Add the shop floor (and store room if any) first. | 0 rows |
| 06_products | `product_type` = `Stock Item` (see I2). | 363 |
| 05_vendor_groups | Blank names (10) and duplicate names (9) | 19 |
| 07_product_skus | Blank rows (no SKU). The 41 fully empty ones are now skipped; 3 partly filled rows remain. | 44 |
| 07_product_skus | No selling price | 52 |
| 07_product_skus | Bad number: cost `108/` (SKU `Fast Action-40`) | 1 |
| 07_product_skus | Cost is higher than selling price (selling at a loss) | 4 |
| 07_product_skus | Barcodes that are not real barcodes (`NO BARCODE`, `silkease-100`, `0000 6781`, `GOLDPSALT2`) | ~10 |
| 07_product_skus | `size_unit` is messy: `gm`/`GM`, `ml`/`ML`/`MLE`, `LITRE`/`LITER`, `PCS`/`pcs` | many |
| 07_product_skus | Every SKU has GST 18%. Zero-rated or exempt items (fresh milk, eggs, bread) need their own rate. | 3900 |
| 07_product_skus | Every purchase unit is `Pcs` with multiplier 1, so no carton or box buying is set up. | 3900 |
| 08_vendors | No primary phone (required, so the row will fail) | 193 |
| 08_vendors | Placeholder phone `1111234567` | 139 |
| 08_vendors | No payment terms | 162 |
| 09_vendor_skus | SKU not found in 07 | 7 |
| 09_vendor_skus | File name `09_vendor_skus (2).csv` must be renamed `09_vendor_skus.csv` | 1 |
| 07 vs 09 | SKUs with no vendor at all | 110 |

---

## 7. PRD coverage

Status: **Done** · **Partial** · **Missing** · **Wrong** (built opposite to the PRD).

| PRD | Feature | Status | Evidence / gap |
|---|---|---|---|
| FR-POS-001 | Barcode billing | Partial | Works, with bugs: box price (M5), possible double add on Enter (`SalePage.tsx:906-931`, see UX doc). Manual search toggle per tenant is missing. |
| FR-POS-002 | Multiple payments + split | Partial | Only one cash row plus one card row. No change given on the cash part. Card is assumed approved and the reference is optional (`bank-edc-driver.ts:13-56`). |
| FR-POS-003/004 | Denomination open/close | Partial | Open is amount only. Close has no count, no expected-vs-counted and no variance (`till-local.ts:349-363, 736-769`; API `tills.service.ts:219-225, 393`). Notes only, no coins. |
| FR-POS-005 | Cash drop over ceiling | Partial | Locks only **after** crossing. Ceiling is a hard-coded constant (`packages/shared/src/till.ts:111`), not per branch. Managers bypass it (D8). |
| FR-POS-006 | Bill hold / recall | Partial | Device-local only, never syncs or expires (D13). |
| FR-POS-007 / BR-005 | Duplicate receipt must not open the drawer | **Wrong** | The reprint button opens the drawer (`SaleDetailPage.tsx:166`), and the receipt printed right after a sale does not (`:75-81`). No "DUPLICATE" mark. Fix: kick the drawer only inside `pos:postSale` and print "DUPLICATE" on reprints. |
| FR-POS-008 | Cost-price / owner discount via auth barcode | Missing | Only the SKU master discount exists. |
| FR-POS-009 | Offline billing | Partial | Works, but is not atomic (D1), can delete sales (D2), needs a cached device code (`device-code.ts:24-40`; store it in SQLite), and rejections are silent (D7). |
| FR-POS-010 | Digital receipt (email/SMS) | Missing | Print and FBR QR only. |
| FR-POS-011 | Shift break / handover | Missing | Only till open/close per user. |
| FR-POS-012/013 | Returns window (7 days) + override | Missing | No window check (`sale-returns.service.ts:243-493`). Refund is always cash, even for card sales (`SaleReturnRefundPage.tsx:66-119`). |
| FR-AUD-001 | Log every action | Partial | Log exists, but writes happen outside the business transaction and can be faked (S8). |
| FR-AUD-002..004 / FR-RBAC-003 | Rotating per-role auth codes, issue/revoke | Missing / Wrong | Per-user TOTP is used instead, and its secrets leak (S1). If TOTP stays as the chosen design, fix S1 and S2 and add a revoke screen. |
| FR-AUD-005 / BR-004 | Till lockout on unauthorized drawer open | Missing | The "Open drawer" button needs no approval and writes no log (`TillPage.tsx:318-330`, `register-pos-handlers.ts:40-48`). Fix: require a supervisor code and a reason, and log it in main. |
| FR-AUD-006 | Immutable audit log + CSV/PDF export | Partial | No append-only trigger, no export (`activity-log.controller.ts`). Fix: Postgres trigger blocking UPDATE/DELETE, plus a CSV export route. |
| FR-INV-001/002 | Single-tier stock + receiving | Done | — |
| FR-INV-003 / BR-008 | Block zero-stock billing | Partial | Blocked on the till (`inventory-out-balance-local.ts:73-80`), but sync accepts it (D6). |
| FR-INV-004 / BR-009 | No negative stock | Partial | No DB CHECK (D6). |
| FR-INV-005 | Barcode aliasing | Done | `product_sku_barcodes` with multiplier. |
| FR-INV-012 | Inter-branch transfer | Missing | Only enum values (`packages/shared/src/inventory.ts:18-19`). |
| FR-RBAC-001/002 | Default and custom roles | Partial | Roles are global, and tenants can edit them (S3). A user can have only one role, so custom roles can't really be assigned (`apps/web/src/app/app/users/page.tsx:146`). |
| FR-MB-001..003 | Multi-branch | Partial | A `locations` table exists, but warehouses, sales and users have no `location_id`. |
| FR-SYNC-001..003 | Stock sync + reconcile | Partial | Engine exists, gaps in D7. No reconcile screen. |
| FR-INT-001/002 | Shopify / WooCommerce | Missing | Phase 2. |
| FR-PRC-001/002 / BR-017 | Price history + effective date | Missing | `selling_price` is overwritten. Fix: a `sku_price_history` table written on every price change, and scheduled prices applied by a job. |
| FR-ACC-001 | Daily till close with denomination reconciliation | Partial | Same gap as FR-POS-004. |
| BR-011/012 | No PV without PO; variance needs auth | Partial | PO → GRN exists. Partial receipts are not tracked (D10). Variance auth relies on the TOTP flow (S1/S2). |
| BR-019 | Fiscal loss → warning + queue | Partial | FBR blocks the receipt (A14). It should queue. |
| NFR-011 | Feature flags / module billing | Missing | No `tenant_modules` table. Platform can't switch modules (pricing model: modules × branches). |
| NFR-001 | Sub-second scan | Partial | Indexed lookup, but the input is disabled during lookup and the legacy lookup is unindexed (A13). |

---

## 8. Fix roadmap

| Sprint | Goal | Items |
|---|---|---|
| **1 — Stop the bleeding** (P0) | No faked approvals, no data leaks, correct money | S1, S2, S3, S4, S5, S6, S7, S8, M1, M3, I1, FR-POS-007 drawer fix, remove debug telemetry (S17) |
| **2 — Safe money and stock** | Nothing lost or counted twice | D1, D2, D3, D4, D5, D6, D7, D8, M2, M4, M5, M6, A9 (tests for each fix as it lands) |
| **3 — Clean structure** | Easier and safer to change | A1, A2, A3, A4, A10, A11, S9–S16, I2, I3, I4, CI job |
| **4 — PRD gaps** | Phase 1 complete | Denomination close and variance, configurable cash ceiling, returns window + override, price history, audit export + append-only, drawer lockout, shift handover, duplicate-receipt mark, digital receipt, cost-price discount, multi-role users |
| **5 — Phase 2 prep** | Multi-branch | `location_id` everywhere, inter-branch transfer, `tenant_modules` + billing, Shopify |

---

## 9. What is already good

- Clean monorepo: pnpm + Turbo, `@blackbox/*` packages, strict TypeScript with `noUncheckedIndexedAccess`, almost no `any`.
- Database done right: money columns are `numeric(14,4)`, schema only via migrations, composite tenant FKs, unique document numbers.
- Strong auth basics: Argon2, hashed rotating refresh tokens, JWT secrets required, revoked devices handled.
- Sync push is idempotent on `change_id`, and there is a real conflicts table.
- Inventory-out, goods receipt and vendor returns already lock their rows. Use them as the pattern for D3.
