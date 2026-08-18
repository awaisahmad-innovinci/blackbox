# Inventory API

Warehouse / inventory APIs for Blackbox desktop. Responses are **raw JSON** (no `{ success, data }` envelope). Paths have **no** `/api` prefix.

## Tenant scope (no desktop JWT)

Inventory routes do **not** use `JwtAuthGuard`. They resolve tenant from:

| Source | Value |
|--------|--------|
| Env | `DEV_TENANT_ID` in `apps/api/.env` |
| Fallback | `DEMO_STORE_TENANT_ID` from `@blackbox/shared` (`a0000000-0000-4000-8000-000000000001`) |

Web admin auth (`/auth/*`, users, roles) is unchanged.

## Apply migrations

```bash
psql "$DATABASE_URL" -f supabase/migrations/20260817112600_inventory_phase1.sql
psql "$DATABASE_URL" -f supabase/migrations/20260817121900_vendor_management.sql
psql "$DATABASE_URL" -f supabase/migrations/20260817140000_product_management.sql
psql "$DATABASE_URL" -f supabase/migrations/20260817153000_purchase_order_management.sql
psql "$DATABASE_URL" -f supabase/migrations/20260817163000_purchase_receiving.sql
psql "$DATABASE_URL" -f supabase/migrations/20260818120000_inventory_out.sql
psql "$DATABASE_URL" -f supabase/migrations/20260818123000_inventory_out_totals.sql
```

```env
DEV_TENANT_ID=a0000000-0000-4000-8000-000000000001
CORS_ORIGINS=http://localhost:3000,http://localhost:5173
```

## Dashboard

### `GET /dashboard/summary`

Counts for Demo Store: `totalProducts`, `totalSkus`, `totalStockLines`, `lowStockItems`, `pendingPurchaseOrders`, `recentReceipts`.

## Brands / categories

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/brands?status=&q=` | Default **active** only (dropdowns). `status=all\|active\|inactive` for management |
| `GET` | `/brands/:id` | Detail |
| `POST` | `/brands` | Create (`name` required; unique per tenant) |
| `PATCH` | `/brands/:id` | Update name / description / status |
| `POST` | `/brands/:id/deactivate` | Soft deactivate |
| `GET` | `/categories?status=&q=` | Same pattern as brands |
| `GET` | `/categories/:id` | Detail |
| `POST` | `/categories` | Create |
| `PATCH` | `/categories/:id` | Update |
| `POST` | `/categories/:id/deactivate` | Soft deactivate |

Product create/update rejects inactive brand/category IDs.

## Warehouses

### `GET /warehouses`

Active warehouses for selects (no CRUD UI in Phase 1).

## Products

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/products` | Query: `search`, `brandId`, `categoryId`, `status`, `page`, `pageSize` |
| `POST` | `/products` | Create product — **requires** `brandId` + `categoryId`; server assigns `productCode` (`PRD-YYYY-######`); `imagePath` is not accepted |
| `GET` | `/products/:id` | Detail + aggregated inventory totals |
| `PATCH` | `/products/:id` | Update product fields only (cannot change `productCode`; no `imagePath`) |
| `POST` | `/products/:id/deactivate` | Soft `inactive` |
| `GET` | `/products/:id/skus` | SKUs for product |
| `POST` | `/products/:id/skus` | Create SKU under product |
| `GET` | `/products/:id/suppliers` | Aggregate `vendor_skus` across product SKUs |
| `GET` | `/products/:id/inventory` | Stock by warehouse for product SKUs |
| `GET` | `/products/:id/movements` | Recent stock movements |

`product_type`: `STOCK_ITEM` \| `CONSUMABLE` \| `RESALABLE`. Status: `active` \| `inactive`. Suppliers are never stored on `products` / `product_skus` — only via `vendor_skus`.

## Vendor groups

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/vendor-groups?status=&q=` | Default **active** only. `status=all\|active\|inactive` for management |
| `GET` | `/vendor-groups/:id` | Detail |
| `POST` | `/vendor-groups` | Create (`name` required; unique per tenant) |
| `PATCH` | `/vendor-groups/:id` | Update name / description / status |
| `POST` | `/vendor-groups/:id/deactivate` | Soft deactivate |

Vendor create/update rejects inactive group IDs.

## Vendors

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/vendors` | Query: `search`, `status`, `groupId`, `page`, `pageSize` |
| `POST` | `/vendors` | Create vendor + contacts in one transaction |
| `GET` | `/vendors/:id` | Full profile |
| `PATCH` | `/vendors/:id` | Update vendor + replace contacts by type |
| `GET` | `/vendors/:id/skus?q=` | Active supplied SKUs (optional search) |

Contacts live in `vendor_contacts` (`PRIMARY` \| `OTHER` \| `MANAGER` \| `SALESPERSON`). Status values: `active` \| `inactive`.

## Vendor ↔ SKU

| Method | Path | Notes |
|--------|------|-------|
| `POST` | `/vendor-skus` | Create / reactivate link |
| `PATCH` | `/vendor-skus/:id` | Update purchase terms |
| `DELETE` | `/vendor-skus/:id` | Soft-deactivate (`inactive`) |

`vendorSkuCode` remains an optional API/DB field for compatibility but is **not collected** in the desktop Add Supplier UI. Packaging (`purchaseUnitId`, `unitsPerPurchaseUnit`) is prefilled from the product SKU; purchase price is entered manually.

## Purchase orders

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/purchase-orders` | Query: `search`, `vendorId`, `warehouseId`, `status`, `dateFrom`, `dateTo`, `page`, `pageSize` |
| `POST` | `/purchase-orders` | Create DRAFT (or `submit: true`); server assigns `PO-YYYY-######` |
| `GET` | `/purchase-orders/:id` | Detail + lines |
| `PATCH` | `/purchase-orders/:id` | **DRAFT only** — header + full item replace |
| `POST` | `/purchase-orders/:id/submit` | DRAFT → SUBMITTED (MOQ enforced) |
| `POST` | `/purchase-orders/:id/cancel` | DRAFT or SUBMITTED → CANCELLED |
| `PATCH` | `/purchase-orders/:id/items/:itemId/price` | SUBMITTED only — update line cost + vendor purchase price + SKU sale price; **rejects** if `unitCost >= sellingPrice` |

Statuses: `DRAFT` \| `SUBMITTED` \| `PARTIALLY_RECEIVED` \| `RECEIVED` \| `CANCELLED`.

Backend recalculates line and header totals. Creating/submitting/cancelling does **not** change inventory. Lines require `vendorSkuId` + `productSkuId`; purchase unit is snapshotted from `vendor_skus`.

## Goods receipts / receiving (Phase 1)

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/purchase-orders/:id/receiving` | SUBMITTED PO with no POSTED receipt; draft header + lines (PO cost + current vendor purchase price) |
| `POST` | `/purchase-orders/:id/receipts` | Atomic confirm: create `POSTED` GR + items + `PURCHASE_RECEIPT` movements + stock upsert + PO → `RECEIVED` |
| `GET` | `/goods-receipts/:id` | Receipt detail (View Receipt) |

Rules: one POSTED receipt per PO; `0 ≤ receivedQty ≤ orderedQty`; inventory delta = `receivedQty × units_per_purchase_unit` (PO line snapshot); never mutate historical PO `unit_cost`. Receipt numbers: `GRN-YYYY-######`. Optional vendor SKU purchase-price updates use existing `PATCH /vendor-skus/:id` (outside the receive transaction).

## Inventory out (Phase 1)

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/skus?q=&warehouseId=` | When `warehouseId` is set, each result includes `quantityAvailable` and `costPrice` (avg) |
| `GET` | `/skus/by-barcode?barcode=&warehouseId=` | Exact barcode match; returns warehouse availability + avg cost (404 if unknown) |
| `POST` | `/inventory-out` | Atomic confirm: `POSTED` header + items + `INVENTORY_OUT` movements + stock decrease; persists `subtotal` / `total` |
| `GET` | `/inventory-out/:id` | Read-only bill detail (lines + subtotal + total) |

Rules: `0 < qty ≤ quantity_available` in the selected warehouse; movements store **positive** qty with type `INVENTORY_OUT`; do **not** change `product_skus.cost_price` on outbound. Out numbers: `IO-YYYY-######`. Snapshot `unit_cost` from avg cost at post. Line total = qty × avg cost; **no discount/tax** so `subtotal === total`. Desktop bill has a trailing barcode scan row (Enter adds/increments qty by 1).

## SKUs / units

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/skus?q=&warehouseId=` | Search product name / variant / sku / barcode; optional warehouse availability + avg cost |
| `GET` | `/skus/by-barcode?barcode=&warehouseId=` | Exact barcode lookup for scanners |
| `GET` | `/skus/:id` | Full SKU detail (pricing, levels, units, product) |
| `PATCH` | `/skus/:id` | Update identity / pricing / levels / status |
| `POST` | `/skus/:id/deactivate` | Soft inactive |
| `GET` | `/skus/:id/inventory` | Warehouse stock for one SKU |
| `GET` | `/skus/:id/vendors` | Suppliers for SKU |
| `GET` | `/units` | Purchase units for selects |

## Desktop

- No login; **Inventory** ▼ → Add Product / See Products / Brands / Categories / Inventory Out; **Purchasing** ▼ → Create Purchase Order / Purchase Orders; **Vendors** ▼ → Add Vendor / See Vendors / Vendor Groups.
- Brands `/brands`, Categories `/categories`, Vendor Groups `/vendor-groups` — list + create/edit + soft deactivate.
- Inventory Out at `/inventory/out` (detail at `/inventory/out/:id`) — bill table with live totals and barcode scan row.
- After successful product/SKU/vendor/PO/goods-receipt writes, renderer upserts into local SQLite via IPC.
- Lists and profiles still read from the HTTP API while online.

## Later

Swap `FixedTenantContext` for JWT `TenantContext` without rewriting tenant filters. Partial/multi-receive and `PARTIALLY_RECEIVED` are out of scope for Phase 1.
