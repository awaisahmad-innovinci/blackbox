import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import type { GoodsReceiptDetail } from "@blackbox/shared";
import { formatStoredDateTime } from "@blackbox/shared";
import { Button } from "@blackbox/ui/button";
import { ListTableLink, ListTableRow } from "@renderer/components/list-table-row";
import { PrintButton } from "@renderer/components/print-button";
import { PrintDocument } from "@renderer/components/print-document";
import { getApiErrorMessage } from "@renderer/lib/api/client";
import { loadGoodsReceipt } from "@renderer/lib/local-db/entity-source";

export function GoodsReceiptProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const seeded = (
    location.state as { receipt?: GoodsReceiptDetail } | null
  )?.receipt;
  const [receipt, setReceipt] = useState<GoodsReceiptDetail | null>(
    seeded ?? null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void loadGoodsReceipt(id)
      .then((detail) => {
        if (!cancelled) {
          setReceipt(detail);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled && !seeded) {
          setError(getApiErrorMessage(err, "Failed to load receipt"));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id, seeded]);

  if (error && !receipt) {
    return (
      <div
        role="alert"
        className="border-destructive/40 bg-destructive/5 text-destructive rounded-lg border px-4 py-3 text-sm"
      >
        {error}
      </div>
    );
  }

  if (!receipt) {
    return <p className="text-muted-foreground text-sm">Loading…</p>;
  }

  return (
    <PrintDocument>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {receipt.receiptNumber}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {receipt.status} · PO{" "}
            <Link
              to={`/purchase-orders/${receipt.purchaseOrderId}`}
              className="text-primary hover:underline"
            >
              {receipt.poNumber}
            </Link>
          </p>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          <PrintButton />
          <Button variant="ghost" onClick={() => navigate("/goods-receipts")}>
            Back
          </Button>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Overview</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Vendor</dt>
            <dd className="font-medium">{receipt.vendorName || "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Warehouse</dt>
            <dd className="font-medium">{receipt.warehouseName}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Received at</dt>
            <dd className="font-medium">
              {formatStoredDateTime(receipt.receivedAt)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Voucher</dt>
            <dd className="font-medium">{receipt.voucherNumber || "—"}</dd>
          </div>
        </dl>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Items</h2>
        <div className="border-border overflow-hidden rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">SKU</th>
                <th className="px-4 py-3 font-medium">Ordered</th>
                <th className="px-4 py-3 font-medium">Received</th>
                <th className="px-4 py-3 font-medium">Bonus / Sample</th>
                <th className="px-4 py-3 font-medium">PO cost</th>
                <th className="px-4 py-3 font-medium">Recv cost</th>
                <th className="px-4 py-3 font-medium">Discount %</th>
                <th className="px-4 py-3 font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {receipt.items.map((item) => (
                <ListTableRow
                  key={item.id}
                  onActivate={() => navigate(`/skus/${item.productSkuId}`)}
                >
                  <td className="px-4 py-3">
                    {item.productName}
                    <div className="text-muted-foreground text-xs">
                      {item.variantName || "—"}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <ListTableLink
                      to={`/skus/${item.productSkuId}`}
                      className="text-primary hover:underline"
                    >
                      {item.sku}
                    </ListTableLink>
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {item.orderedQuantity}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {item.receivedQuantity}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {(item.bonusQuantity ?? 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {item.poUnitCost.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {item.receivingUnitCost.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {item.discountPercent.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {item.lineTotal.toLocaleString()}
                  </td>
                </ListTableRow>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid max-w-sm gap-2 text-sm sm:ml-auto">
        <div className="flex justify-between gap-6">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="tabular-nums">
            {receipt.subtotal.toLocaleString()}
          </span>
        </div>
        <div className="flex justify-between gap-6">
          <span className="text-muted-foreground">Discount</span>
          <span className="tabular-nums">
            {receipt.discount.toLocaleString()}
          </span>
        </div>
        <div className="flex justify-between gap-6">
          <span className="text-muted-foreground">Sale tax</span>
          <span className="tabular-nums">
            {receipt.saleTax.toLocaleString()}
          </span>
        </div>
        <div className="flex justify-between gap-6">
          <span className="text-muted-foreground">Adv tax</span>
          <span className="tabular-nums">
            {receipt.advTax.toLocaleString()}
          </span>
        </div>
        <div className="flex justify-between gap-6">
          <span className="text-muted-foreground">GST</span>
          <span className="tabular-nums">{receipt.gst.toLocaleString()}</span>
        </div>
        <div className="flex justify-between gap-6">
          <span className="text-muted-foreground">Incentive</span>
          <span className="tabular-nums text-green-700 dark:text-green-400">
            −{receipt.incentive.toLocaleString()}
          </span>
        </div>
        <div className="flex justify-between gap-6">
          <span className="text-muted-foreground">Shelf rent</span>
          <span className="tabular-nums text-green-700 dark:text-green-400">
            −{receipt.shelfRent.toLocaleString()}
          </span>
        </div>
        {receipt.returnCredit > 0 ? (
          <div className="flex justify-between gap-6">
            <span className="text-muted-foreground">Return credit</span>
            <span className="tabular-nums">
              −{receipt.returnCredit.toLocaleString()}
            </span>
          </div>
        ) : null}
        <div className="flex justify-between gap-6 border-t pt-2 font-medium">
          <span>Grand total</span>
          <span className="tabular-nums">{receipt.total.toLocaleString()}</span>
        </div>
      </section>
    </PrintDocument>
  );
}
