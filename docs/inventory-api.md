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
| `GET` | `/goods-receipts` | Paginated list (`search`, `vendorId`, `warehouseId`, `status`, `dateFrom`, `dateTo`, `page`, `pageSize`) |
| `GET` | `/goods-receipts/:id` | Receipt detail (View Receipt) |

Rules: one POSTED receipt per PO; `0 ≤ receivedQty ≤ orderedQty`; inventory delta = `receivedQty × units_per_purchase_unit` (PO line snapshot); never mutate historical PO `unit_cost`. Receipt numbers: `GRN-YYYY-######`. Optional vendor SKU purchase-price updates use existing `PATCH /vendor-skus/:id` (outside the receive transaction).

## Inventory out (Phase 1)

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/skus?q=&warehouseId=` | When `warehouseId` is set, each result includes `quantityAvailable` and `costPrice` (avg) |
| `GET` | `/skus/by-barcode?barcode=&warehouseId=` | Exact barcode match; returns warehouse availability + avg cost (404 if unknown) |
| `POST` | `/inventory-out` | Atomic confirm: `POSTED` header + items + `INVENTORY_OUT` movements + stock decrease; persists `subtotal` / `total` |
| `GET` | `/inventory-out` | Paginated list (`search`, `warehouseId`, `dateFrom`, `dateTo`, `page`, `pageSize`) |
| `GET` | `/inventory-out/:id` | Read-only bill detail (lines + subtotal + total) |

Rules: `0 < qty ≤ quantity_available` in the selected warehouse; movements store **positive** qty with type `INVENTORY_OUT`; do **not** change `product_skus.cost_price` on outbound. Out numbers: `IO-YYYY-######`. Snapshot `unit_cost` from avg cost at post. Line total = qty × avg cost; **no discount/tax** so `subtotal === total`. Desktop bill has a trailing barcode scan row (Enter adds/increments qty by 1).

## Inventory movements

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/inventory-movements` | Tenant-wide paginated list (`productSkuId`, `warehouseId`, `since`, `page`, `pageSize`); includes `referenceType` / `referenceId` |
| `GET` | `/products/:id/movements` | Product-scoped recent movements (existing) |

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

## Master-data CSV import

The Dashboard **Upload Old Data** action accepts **exactly one** template CSV
per request (maximum 10 MB):

| Method | Path | Notes |
|--------|------|-------|
| `POST` | `/inventory-imports/master-data` | Multipart field `files` with one master-data CSV; atomically imports that file |

The user templates are checked into
[`docs/import-templates/master-data/`](import-templates/master-data/). Give that
folder to users; the app does not download templates. Upload one file at a time
in dependency order. Filenames and headers must remain unchanged. ZIP and
multi-file uploads are rejected.

Import order: units → brands → categories → warehouses → vendor groups →
products → product SKUs → vendors/contacts → vendor-SKU pricing. References use
the natural keys documented in the template README and must resolve from
existing tenant data when not present in the uploaded file. `06_products.csv`
defines a permanent, tenant-unique `import_key`; SKU rows refer to it with
`product_import_key`.

Allowed values:

- `status`: `active`, `inactive`
- unit `type`: `count`, `weight`, `volume`, `length`, `other`
- `product_type`: `STOCK_ITEM`, `CONSUMABLE`, `RESALABLE`
- `payment_terms`: `CASH`, `7_DAYS`, `15_DAYS`, `30_DAYS`, `45_DAYS`, `CUSTOM`
- booleans: `true`, `false`

Rows are upserted by stable keys, so repeating an upload updates units, named
reference data, warehouses, products, SKUs, vendors, and vendor-SKU links rather
than duplicating them. The API validates the uploaded file before committing.
Any row error rolls back the upload and returns file, line, column, and message
details.
After a successful cloud import, desktop automatically syncs only the imported
entity type(s) into SQLite. Historical transactions and opening stock are not
part of this master-data format.

## Desktop

- No login; **Inventory** ▼ → Add Product / See Products / Brands / Categories / Inventory Out; **Purchasing** ▼ → Create Purchase Order / Purchase Orders; **Vendors** ▼ → Add Vendor / See Vendors / Vendor Groups.
- Brands `/brands`, Categories `/categories`, Vendor Groups `/vendor-groups` — list + create/edit + soft deactivate.
- Inventory Out at `/inventory/out` (detail at `/inventory/out/:id`) — bill table with live totals and barcode scan row.
- After successful product/SKU/vendor/PO/goods-receipt/inventory-out writes, renderer upserts into local SQLite via IPC.
- **Local-first reads (Phase 2):** Dashboard cards, Products list, Vendors list, and Purchase Orders list use SQLite when the local DB is connected **and** `sync_meta.last_full_pull_at` is set; otherwise they fall back to the HTTP API. Each page shows a “Showing local data” / “Showing API data” hint. Profile/detail pages still use the API.
- **Sync (Dashboard):** Click **Sync** on the local-DB banner to pull cloud data into SQLite: reference data, products/SKUs, vendors/vendor-SKUs, purchase orders, stock, goods receipts, inventory outs, and inventory movements. Upsert-by-id only; schema is not recreated. Writes `sync_meta.last_full_pull_at`. Does not push local→cloud or resolve conflicts.
- **Upload Old Data (Dashboard):** Select one changed CSV, a related subset, or a complete ZIP. Unselected templates are optional. Existing rows are updated, then full Sync refreshes local SQLite.

## Later

Swap `FixedTenantContext` for JWT `TenantContext` without rewriting tenant filters. Partial/multi-receive and `PARTIALLY_RECEIVED` are out of scope for Phase 1.
