# Sales API

POS retail bills: scan-to-cart checkout using **selling prices**, header-level GST and sales tax, multi-method payments, stock decremented from **POS floor balance** (`inventory_out_items`). Items must be moved to the floor via [Inventory Out](./inventory-api.md#inventory-out) before they can be sold.

## Permissions

| Key | Description |
|-----|-------------|
| `sales.read` | List bills and view receipts |
| `sales.write` | Create and post sales |
| `sales.void` | Void posted sales (restores POS balance) |

**CASHIER** role: `sales.read`, `sales.write`, plus `desktop.access` and `sync.use`. Desktop nav shows **Dashboard** and **Sale** only.

**MANAGER** / **OWNER**: full nav; managers also receive `sales.void`.

## Endpoints

All routes require JWT + permission guard. Tenant is always from the JWT.

### `GET /sales`

Permission: `sales.read`

Query: `search`, `warehouseId`, `status` (`DRAFT` \| `POSTED` \| `VOID`), `dateFrom`, `dateTo`, `page`, `pageSize`.

Returns paginated list items: `saleNumber`, `warehouseName`, `status`, `total`, `itemCount`, `postedAt`.

### `GET /sales/:id`

Permission: `sales.read`

Returns header, line items (selling price snapshot, qty, `sellUnit`, optional barcode), payments, `customerName`, and `postedByName` (cashier snapshot at post time).

### `POST /sales`

Permission: `sales.write`

Creates a **POSTED** sale in one transaction (desktop offline pattern: local commit + sync push).

Body:

```json
{
  "warehouseId": "uuid",
  "saleNumber": "optional — allocated server-side if omitted",
  "gstRate": 0,
  "salesTaxRate": 0,
  "customerName": "optional — defaults to CASH SALES CUSTOMER when blank",
  "cashTendered": "optional — cash received from customer; stored for receipt change line",
  "notes": "",
  "items": [
    {
      "productSkuId": "uuid",
      "quantity": 1,
      "unitPrice": 100,
      "lineTotal": 100,
      "sellUnit": "pc",
      "barcode": "optional"
    }
  ],
  "payments": [
    { "method": "CASH", "amount": 100, "reference": "" }
  ]
}
```

Rules:

- Sum of `payments[].amount` must equal computed bill total (`subtotal` + GST + sales tax).
- Each line qty must be &gt; 0 and ≤ POS balance for that SKU in the warehouse (`inventory_out_items`).
- Duplicate `productSkuId` lines in the request are merged by quantity.
- On post: inserts `sales`, `sale_lines`, `sale_payments`; decrements POS balance; writes `inventory_movements` with `movement_type = 'SALE'`.
- Bill numbers: `{initials}-SB-##` (see `@blackbox/shared` `nextSaleNumber()`).

Payment methods: `CASH`, `CARD`, `CREDIT`.

### `POST /sales/:id/void`

Permission: `sales.void`

Voids a **POSTED** sale and restores POS balance for each line. Idempotent rejection if already void.

## Barcode lookup (POS balance)

### `GET /skus/by-barcode`

Existing endpoint; optional query `balance=pos` returns `quantityAvailable` from `inventory_out_items` instead of warehouse `inventory_stock`.

```
GET /skus/by-barcode?barcode=...&warehouseId=...&balance=pos
```

## Sync

Entity type: `sale` on the **purchasing** sync stream (`streamForEntity('sale')` → `purchasing`).

Desktop posts locally via `commitLocalChange({ entityType: 'sale', operation: 'UPSERT', payload: SaleDetail })` and pushes through the outbox. Pull applies UPSERT snapshots and adjusts local POS balance when status transitions to `POSTED` or from `POSTED` to `VOID`.

## Held bills (desktop only)

Cashiers can **hold** an in-progress bill on the POS device (`status: DRAFT`, `sync_status: local`). Held bills:

- Stay on **this device only** until posted or discarded — they are **not** pushed to the cloud or visible in web admin while open.
- **Reserve** POS floor balance (other sales subtract qty held in local drafts for the same warehouse/SKU).
- Use hold numbers `{initials}-HOLD-##`; a real `{initials}-SB-##` is allocated only when the bill is **posted**.
- **Discard** removes the local draft and releases the reservation.
- **Post** uses the normal `POST /sales` / local `POSTED` commit flow; stock is deducted only at post time.

No new API routes — held bills are a desktop SQLite workflow only.

## Desktop routes

| Route | Permission | Purpose |
|-------|------------|---------|
| `/sales/new` | `sales.write` | Counter checkout (scan, tax, payments, optional customer name) |
| `/sales/new/:draftId` | `sales.write` | Resume a held bill |
| `/sales/held` | `sales.write` | List held bills on this device |
| `/sales` | `sales.read` | Bill list (linked from **Past sales** on the sale screen) |
| `/sales/:id` | `sales.read` | Thermal receipt view + void (managers); held drafts show resume/discard |

Keyboard: **Alt+S** opens Sale when `sales.write` is granted.

## Receipt (thermal POS)

Desktop prints an **80mm** thermal layout: centered business name and address (from onboarding location via session), customer name, line items (**name / qty / price / total** — no SKU), then total items, total qty, and when cash tender exceeds the bill, **Cash** and **Change** lines above gross total, then gross total, cashier name, and non-cash payment lines. Reprints use stored `postedByName` and `cashTendered` when available.
