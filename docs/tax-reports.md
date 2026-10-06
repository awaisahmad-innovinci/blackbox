# Tax reports

## `GET /tax-reports/summary`

Permission: **`tax.reports.read`** (default: owner on web, owner and manager on desktop).

Query:

| Param | Required | Description |
|-------|----------|-------------|
| `dateFrom` | yes | `YYYY-MM-DD` (inclusive) |
| `dateTo` | yes | `YYYY-MM-DD` (inclusive) |
| `vendorId` | no | UUID — limits **paid to vendors** to one vendor |
| `taxKind` | no | `all` (default), `gst`, `sale_tax`, `adv_tax`, `sales_tax`, `credits` |

### Paid to vendors

Source: **posted** `goods_receipts` where `received_at` falls in the range.

Per voucher, amounts are **header** (`tax` / sale tax, `adv_tax`, `gst`, `incentive`, `shelf_rent`) plus **line** sums (`sale_tax`, `adv_tax`, `gst` on `goods_receipt_items`). Incentive and shelf rent are reported as **credits** (vendor-side reductions), not as tax.

Response includes totals, `byVendor[]`, and `byMonth[]`.

### Collected from customers

- **Gross**: `sales` with `status = 'POSTED'` and `posted_at` in range — sum of `gst_amount`, `sales_tax_amount`.
- **Returns**: `sale_returns` with `status IN ('PENDING','COMPLETED')` and `return_date` in range — same tax columns subtracted for **net** collected.
- Voided sales (`status = 'VOID'`) are excluded.

### UI

- Web: `/app/reports/taxes`
- Desktop: `/reports/taxes` (API only; requires online session)
