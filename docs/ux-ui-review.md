# Blackbox — UX / UI Review (Doc 2 of 2)

| | |
|---|---|
| **Scope** | Desktop POS, Web admin, Platform console, `packages/ui` |
| **Read first** | [codebase-review.md](./codebase-review.md). Fix the code issues before starting the redesign. |
| **Date** | 16 Nov 2026 |

**Rule:** the screens change, the business rules don't. Every item is **Where → Problem → Fix**.
Priority: **P1** hurts the cashier or owner every day · **P2** noticeable · **P3** polish.

---

## 0. Top 10 quick wins

1. **F10** both posts the sale **and** opens FOC. Give FOC its own key.
2. One scan may add the item **twice**. Keep only one Enter handler.
3. Don't disable the scan box while a lookup runs.
4. Beep and flash red on a failed scan.
5. Show the receipt straight away. Send FBR in the background.
6. Print silently (no OS print dialog after every sale).
7. Web: "Session expired" instead of "Invalid username or password".
8. Web: add `error.tsx`, `not-found.tsx` and `loading.tsx`.
9. Web: add Roles and Permissions to the menu, and a "Forgot password" page.
10. Use the tenant currency instead of a hard-coded "Rs".

---

## Revamp pass 1: status (16 Nov 2026)

**Look: "Ledger Green + Shelf-tag".**
- Slate neutrals and a ledger-green primary.
- Shelf-tag yellow is kept only for prices, bill totals and amount due.
- Instrument Sans with tabular figures, self-hosted so it works offline.
- Light, dark and match-system themes.
- All tokens live in `packages/ui/src/styles/globals.css`.

New shared parts in `@blackbox/ui`:
- `page-header`, `empty-state`, `kbd`, `price-tag`
- `money-input`, `native-select`, `data-table` (sortable), `confirm-dialog`
- `sonner` toasts, `theme-toggle` and `hooks/use-theme`

| ID | Status | Note |
|---|---|---|
| U1 | ✅ | One keymap (`features/sales/sale-keymap.ts`). F10 = post, F2 = focus scan, **F12 = add FOC**, **Ctrl+F9 = split**. Buttons and hint bar read from it. |
| U2 | ✅ | One Enter adds one item (`handledScanEnterEvents`). |
| U3 | ✅ | Scan box stays enabled while looking up; codes queue. |
| U4 | ✅ | Error beep plus red flash on a failed scan. |
| U7 | ✅ | Stock error decided outside the state updater. |
| U8 | 🟡 | "Posting and sending to FBR…" status. Order unchanged, because the receipt needs the FBR number. |
| U9 | ✅ | Opt-in "Print receipts without the print dialog" (off by default). |
| U10 | ✅ | A reprint prints **DUPLICATE** and never opens the drawer. |
| U19 | 🟡 | Sync shown as a coloured dot. A full "not synced" list is still to do. |
| W1, W2, W8 | ✅ | Session-expired message. "Cannot be reached, try again" screen without signing out. Safe storage write. |
| W3 | ✅ | `error`, `global-error`, `not-found` and `loading` pages (web and platform). |
| W4, W12, W15 | ✅ | Were already done or don't apply: forgot password is inline, all four approval switches exist, and the tax form is hidden. |
| W5 | ✅ | A failed tenant check shows Retry instead of opening the app. |
| W7, W9, W23, W24 | ✅ | Grouped nav with Roles and Permissions, clearer sign-out, tab titles, decorative icon removed. |
| W11 | ✅ | Activity log **Export CSV** (up to 5,000 rows). |
| W14 | ✅ | Owner cash, drawer and expense amounts use `MoneyInput` and a confirm step. |
| W16 | 🟡 | Sortable Users table and paged vendor payments. Other lists are next. |
| W18 | ✅ | Shop currency (`formatCurrency`, `useCurrency`). |
| W19 | ✅ | All web selects are `NativeSelect`. |
| W20, W21, W22 | ✅ | CSV with BOM and formula guard; names allow `'` `-` `.` and any script (tested). |
| PL1, PL2, PL4, PL6 | ✅ | Shared nav, type the shop name to deactivate, search and keyboard rows, 401 goes back to sign-in. |
| PL7 | ⏭ | Not split into pages yet (no user-visible gain this pass). |
| DS1–DS8 | 🟡 | Shared kit added. Status colours are tokens (AA contrast). Web/desktop ConfirmDialog and DataTable are shared. DS3 skipped: `ui/dialog` uses `form-keyboard`. |

**Deferred (flow changes, separate task):** U11, U12, U14, U15, U16, U17, W10, W13, PL3, PL5.

---

## 1. Desktop POS: the counter (most important)

The cashier looks at the product, not the screen. Every extra tap or dialog costs time on every
sale. PRD NFR-010 asks for one-handed use, with main actions within 2 taps.

### 1a. Scanning and keyboard

| ID | Pri | Where | Problem | Fix |
|---|---|---|---|---|
| U1 | P1 | `features/sales/SalePage.tsx:1587-1591, 1626-1637, 1650-1653`; `packages/ui/src/lib/form-keyboard.ts:18-25` | **F10** = Post sale and Add FOC. **F2** = Focus scan and Split payment. The on-screen hints contradict each other. | One keymap per page. Each key has one job, and the hint text is generated from the keymap. |
| U2 | P1 | `SalePage.tsx:906-931, 1827-1831`; `lib/barcode-scan.tsx:368-376` | Enter in the scan box fires two handlers, so the quantity can double. Please confirm by hand: scan one item and check whether the quantity shows 2. | Keep only the hook's handler. |
| U3 | P1 | `SalePage.tsx:1815` | The scan box is `disabled` while looking up, so fast back-to-back scans lose focus and characters. | Keep it enabled and push codes into the existing `scanQueueRef`. |
| U4 | P1 | `SalePage.tsx:1799-1801` | A failed scan shows only small red text. | Short error beep, the line flashes red, and a big message: "Not found: 8964…". |
| U5 | P2 | `SalePage.tsx:1587-1668` | 3 keyboard systems (page keyboard, local `keydown`, app nav) all listen on `window`. | One shortcut registry with conflict detection (fixes U1 for good). |
| U6 | P2 | `lib/barcode-scan.tsx:252-257` | The first character of a wedge scan is not blocked, so it can land in another field. | Block it once a scan burst is detected. |
| U7 | P2 | `SalePage.tsx:716-769, 802-842` | The stock error is set inside a `setLines` updater, so the message can be lost. | Compute the next state first, then set the lines and the error. |

### 1b. Paying and finishing a sale

| ID | Pri | Where | Problem | Fix |
|---|---|---|---|---|
| U8 | P1 | `SalePage.tsx:1400-1515`, `submit-fbr.ts:44` | After Post, the cashier waits for FBR, logs and a till reload before seeing the receipt. | Go to the receipt or a new sale **at once**. Show a small "FBR pending / sent" badge. |
| U9 | P1 | `SaleDetailPage.tsx:80` | `window.print()` opens the OS dialog after every sale. | Silent print to the saved printer (`webContents.print({ silent: true, deviceName })`) or ESC/POS. |
| U10 | P1 | `SaleDetailPage.tsx:166` | The reprint button opens the drawer, and nothing marks a reprint. | Reprint never opens the drawer and prints **DUPLICATE** in large text. |
| U11 | P2 | `SalePage.tsx:158-195, 455-458, 564-571` | Split payment allows only 1 cash + 1 card, with no change shown on the cash part. | Payment rows (add a row per method). Show "Tendered / Change" for cash. Show the remaining balance as you type. |
| U12 | P2 | `bank-edc-driver.ts`, `use-card-terminal-amount-sync.ts:87-123` | The amount is typed into the terminal automatically, even into another window. Card success is assumed. | A "Send to terminal" button, then an "Approved?" step that asks for the approval code. |
| U13 | P2 | `SalePage.tsx:409-427` | The total on screen (2 decimals) differs from the stored total (4 decimals). No cash rounding line. | Show one total that matches the receipt, with a "Rounding" line. |
| U14 | P2 | — | No warning before the till crosses its cash ceiling. It locks only after. | Banner: "Cash drop needed after this sale" when the next sale will cross the ceiling. |

### 1c. Till, returns, held bills

| ID | Pri | Where | Problem | Fix |
|---|---|---|---|---|
| U15 | P1 | `TillPage.tsx:318-330` | "Open drawer" opens straight away. | Ask for a manager code and a reason (from a list), then open. |
| U16 | P1 | `till-local.ts:349-363, 736-769` | Till open and close don't ask for note counts. Close shows no expected vs counted. | A denomination grid (5000 … 1, coins), auto total, then "Expected Rs X · Counted Rs Y · Short Rs Z". Optional blind count. |
| U17 | P2 | `SaleReturnFormPage.tsx`, `SaleReturnRefundPage.tsx:66-119` | No returns window warning. Refund is always cash. | Show "Bought 9 days ago, manager code needed" and default the refund to the original method. |
| U18 | P2 | `HeldSalesPage.tsx` | Held bills never expire, and nothing shows that they hold stock. | Show the age and held quantity, and auto-expire at shift close with a warning. |
| U19 | P2 | `api/sync.ts:178-189` | Sales the server rejected are invisible. | A "Not synced (3)" badge in the top bar that opens a list with reasons. |
| U20 | P3 | `features/*` | 70 native `<select>`, 15 native `<input>`, 6 native `<button>`. | Use `@blackbox/ui` Select, Input and Button so the redesign reaches every screen. |
| U21 | P3 | repo-wide | No toasts. Every message is inline text. | Add a toast (sonner) in `@blackbox/ui` for short results ("Synced", "Sent to terminal"). |
| U22 | P3 | `lib/release-stuck-modal-state.ts`, `debug-input-freeze.ts` | Hacks for modals that get stuck. | Fix the Radix focus root cause and delete the hacks. |

**Keep:** the scan box gets focus back after dialogs (`SalePage.tsx:298-301`), the keyboard hints, the
held-bill empty state, and the confirm provider (with `window.confirm` banned by lint).

---

## 2. Web admin (owner)

### 2a. Session and errors

| ID | Pri | Where | Problem | Fix |
|---|---|---|---|---|
| W1 | P1 | `apps/web/src/lib/api-client.ts:163`, `api-error.ts:17` | An expired session says "Invalid username or password". | "Your session expired. Please sign in again." |
| W2 | P1 | `components/auth-provider.tsx:58-81`, `api-client.ts:165` | A server error during refresh shows an endless spinner (retries every 5 seconds). | Back off with a limit, then show an "Offline / Server busy" screen with a **Retry** button. Treat 5xx as different from offline. |
| W3 | P1 | `apps/web/src/app/` | No `error.tsx`, `global-error.tsx`, `not-found.tsx` or `loading.tsx`. A crash gives a white screen. | Add all four (same for platform). |
| W4 | P1 | `lib/auth-api.ts:53-73` | The forgot and reset password API exists, but there is no page. | Add `/forgot-password` and `/reset-password`. |
| W5 | P2 | `components/app-shell.tsx:212-215` | If loading the tenant fails, the app opens anyway, even when onboarding isn't finished. | Show an error with Retry instead. |
| W6 | P2 | `components/require-permission.tsx:17` | An anonymous user sees a skeleton forever. | Redirect to sign in. |
| W7 | P3 | `app-shell.tsx:324-325` | The logout dialog's title and text are the same. | Text: "You will be signed out on this browser." |
| W8 | P3 | `lib/auth-storage.ts:36` | Login can crash in Safari private mode. | Wrap it in try/catch like the other storage calls. |

### 2b. Navigation and pages

| ID | Pri | Where | Problem | Fix |
|---|---|---|---|---|
| W9 | P1 | `app-shell.tsx:40-85` | The Roles and Permissions pages exist but are not in the menu. Warehouses is shown only with `warehouses.write`. | Add both menu items. Gate warehouses on `warehouses.read`. |
| W10 | P1 | `users/page.tsx:146`, `users/[id]/page.tsx:52, 425` | A user can get only one system role, so custom roles are useless. | A multi-select of roles. |
| W11 | P1 | `activity/page.tsx` | The activity log has no export and no user or device filter. | Filters plus **Export CSV**. PDF later (PRD FR-AUD-006). |
| W12 | P2 | `settings/page.tsx:124-125` | Only 2 of the 4 manager-approval switches are shown. | Add till-open and till-withdraw approval switches. |
| W13 | P2 | — | No price history screen (PRD FR-PRC-001). | Show a "Price history" tab on the SKU: old price → new price, date, who. |
| W14 | P2 | `app/page.tsx:432-436, 489, 556` | Owner cash, drawer funding and expense: one click moves money, with no confirm and no input check (`1e5` is accepted). | A confirm step ("Add Rs 100,000 to Drawer 1?"), a shared money input, and disabling the button while saving. |
| W15 | P2 | `settings/page.tsx:126-127, 218-233` | A bad tax rate quietly becomes 0%. | Show "Must be 0–100" and block saving. |

### 2c. Tables, lists and formatting

| ID | Pri | Where | Problem | Fix |
|---|---|---|---|---|
| W16 | P2 | all list pages | No column sorting. Only 2 pages paginate. Vendor payments shows only the first 20 (`vendors/payments/page.tsx:78`). | One `DataTable` in `@blackbox/ui` (TanStack Table) with sort, search and server-side pages. |
| W17 | P2 | `data-table.tsx:31` | Tables force `min-w-[640px]`, so everything scrolls sideways on a phone. | Cards or list rows under `sm`. |
| W18 | P2 | `app/page.tsx:84`, `vendors/payments/page.tsx:41` | "Rs" is hard-coded, but onboarding offers other currencies. | `formatCurrency(value, tenant.currency)`. |
| W19 | P2 | 10 pages (e.g. `devices/page.tsx:130`, `users/page.tsx:288`) | Native `<select>`. | `@blackbox/ui/select`. |
| W20 | P2 | `lib/download-file.ts:12-13` | The CSV download can fail in Safari or Firefox, and Urdu text breaks in Excel. | Revoke the URL later and add a BOM (`﻿`). |
| W21 | P2 | `packages/shared/src/inventory-in-out-report-csv.ts:8-14` | A product called `=HYPERLINK(...)` runs as a formula in Excel. | Prefix cells that start with `= + - @` with `'`. |
| W22 | P2 | `packages/shared/src/validation.ts:1` | Names allow ASCII letters only, so "Abdul-Rahman", "O'Neil" and Urdu names fail. | Allow `\p{L}` plus `' - .`. |
| W23 | P3 | `layout.tsx:5-9` | Every tab is titled "Blackbox". | A title per page ("Users · Blackbox"). |
| W24 | P3 | `app-shell.tsx:315` | A decorative icon looks like a button. | Remove it. |

---

## 3. Platform console (operator)

| ID | Pri | Where | Problem | Fix |
|---|---|---|---|---|
| PL1 | P1 | `tenant-management.tsx:353-366` | The home page has no nav, so Roles can't be reached. | Shared layout with nav and a session guard. |
| PL2 | P1 | `tenant-management.tsx:601-611` | Deactivate locks out a whole shop in one click. | A confirm dialog that asks for the shop name to be typed. |
| PL3 | P1 | `tenant-management.tsx:519` | The new owner's password is shown on screen. | Show "Invite link sent" instead (see codebase S11). |
| PL4 | P2 | `tenant-management.tsx:576-582` | Rows are clickable `<tr>` with no keyboard support. No search or pages. | Row link or button, a search box and server-side pages. |
| PL5 | P2 | — | No tenant detail page. | `/tenants/[id]`: users, devices, last sync, FBR status, enabled modules. |
| PL6 | P2 | `app/roles/page.tsx:51-53` | A 401 shows raw error text. | One `usePlatformSession` hook that handles 401 and redirects to login. |
| PL7 | P2 | `tenant-management.tsx` (696 lines) | Login, create, list and reset are all in one component. | Split it into pages: `/login`, `/tenants`, `/tenants/new`, `/tenants/[id]`. |

---

## 4. Design system (`packages/ui`)

| ID | Pri | Where | Problem | Fix |
|---|---|---|---|---|
| DS1 | P2 | `packages/ui/src/components/*` | Unused everywhere: `sidebar` (724 lines), `breadcrumb`, `command`, `drawer`, `form`, `navigation-menu`, `popover`, `scroll-area`, `switch`, `tabs`, `tooltip`. Web builds its own sidebar. | Either use them (Sidebar in AppShell, Form for every form, Tabs on SKU and vendor profiles), or delete them. Recommendation: **use** Sidebar, Form and Tabs, and delete the rest. |
| DS2 | P2 | `packages/ui/package.json:21, 28, 31` | react-hook-form and zod are installed but no app uses them. Each form checks fields by hand with `useState`. | One pattern: RHF + zod, with schemas from `packages/shared/src/validation.ts`. |
| DS3 | P2 | `packages/ui/src/lib/form-keyboard.ts` | POS F-key logic lives in the generic UI package, and its "match" function also calls `preventDefault`. | Move it to desktop (or a `pos-ui` folder) and make the matcher pure. |
| DS4 | P2 | — | No Table, Toast or MoneyInput / Denomination grid in ui. | Add `table`, `sonner`, `MoneyInput` and `DenominationGrid`, shared by web and desktop. |
| DS5 | P3 | `globals.css:3, 44`; `apps/web/src/app/globals.css:33-37` | Dark tokens exist, but nothing turns dark mode on. The login gradient is hard-coded light. | `next-themes` in web, and tokenise the gradient. Desktop: follow the OS setting. |
| DS6 | P3 | `apps/web/src/app/globals.css:4-38` vs platform | `bb-page`, `bb-surface` and `bb-auth-canvas` are copied and have drifted. | Move them into `packages/ui` globals. |
| DS7 | P3 | `packages/eslint-config/next.js` | No accessibility lint. Desktop has only 45 `aria-*` attributes. | Add `eslint-plugin-jsx-a11y`. Give icon-only buttons an `aria-label`. |
| DS8 | P3 | `badge.tsx:21-25`, `button.tsx:26-32` | Extra variants, undocumented. | List them in `architecture.md`. |

---

## 5. Order of work

1. **Counter speed (P1 desktop):** U1–U4, U8–U10, U15, U16.
2. **Owner trust (P1 web):** W1–W4, W9–W11, PL1–PL3.
3. **Shared building blocks:** DS2, DS4 (Table, Toast, MoneyInput, DenominationGrid), then W16, U20, W19.
4. **Polish:** the remaining P2 and P3 items, dark mode, accessibility.
