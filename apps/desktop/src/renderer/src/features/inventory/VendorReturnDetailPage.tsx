import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import type { VendorReturnDetail } from "@blackbox/shared";
import {
  VENDOR_RETURN_REASON_LABELS,
  VENDOR_RETURN_SETTLEMENT_LABELS,
} from "@blackbox/shared";
import { Button } from "@blackbox/ui/button";
import { ListTableRow } from "@renderer/components/list-table-row";
import { PrintButton } from "@renderer/components/print-button";
import { PrintDocument } from "@renderer/components/print-document";
import { getApiErrorMessage } from "@renderer/lib/api/client";
import { loadVendorReturn } from "@renderer/lib/local-db/entity-source";

export function VendorReturnDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const seeded = (location.state as { detail?: VendorReturnDetail } | null)
    ?.detail;
  const [detail, setDetail] = useState<VendorReturnDetail | null>(seeded ?? null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void loadVendorReturn(id)
      .then((row) => {
        if (!cancelled) {
          setDetail(row);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled && !seeded) {
          setError(getApiErrorMessage(err, "Failed to load vendor return"));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id, seeded]);

  if (error && !detail) {
    return (
      <div
        role="alert"
        className="border-destructive/40 bg-destructive/5 text-destructive rounded-lg border px-4 py-3 text-sm"
      >
        {error}
      </div>
    );
  }

  if (!detail) {
    return <p className="text-muted-foreground text-sm">Loading…</p>;
  }

  return (
    <PrintDocument>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {detail.returnNumber}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {detail.status} ·{" "}
            <Link
              to={`/vendors/${detail.vendorId}`}
              className="text-primary hover:underline"
            >
              {detail.vendorName}
            </Link>
          </p>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          <PrintButton />
          <Button variant="ghost" onClick={() => navigate("/inventory/returns")}>
            Back
          </Button>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Overview</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Warehouse</dt>
            <dd className="font-medium">{detail.warehouseName}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Return date</dt>
            <dd className="font-medium">{detail.returnDate}</dd>
          </div>
        </dl>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Items</h2>
        <div className="border-border overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">SKU</th>
                <th className="px-4 py-3 font-medium">Reason</th>
                <th className="px-4 py-3 font-medium">Qty</th>
                <th className="px-4 py-3 font-medium">Unit cost</th>
                <th className="px-4 py-3 font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Settlement</th>
              </tr>
            </thead>
            <tbody>
              {detail.items.map((item) => (
                <ListTableRow key={item.id}>
                  <td className="px-4 py-3">
                    {item.productName}
                    <div className="text-muted-foreground text-xs">
                      {item.variantName || "—"}
                    </div>
                  </td>
                  <td className="px-4 py-3">{item.sku}</td>
                  <td className="px-4 py-3">
                    {VENDOR_RETURN_REASON_LABELS[item.reason]}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {item.quantity} {item.purchaseUnitName || ""}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {item.unitCost.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {item.lineTotal.toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    {item.settlement
                      ? VENDOR_RETURN_SETTLEMENT_LABELS[item.settlement]
                      : "Open"}
                    {item.goodsReceiptId ? (
                      <div className="text-muted-foreground text-xs">
                        Applied on receipt
                      </div>
                    ) : null}
                  </td>
                </ListTableRow>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid max-w-sm gap-2 text-sm sm:ml-auto">
        <div className="flex justify-between gap-6 border-t pt-2 font-medium">
          <span>Total</span>
          <span className="tabular-nums">{detail.total.toLocaleString()}</span>
        </div>
      </section>
    </PrintDocument>
  );
}
