import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import type { InventoryOutDetail } from "@blackbox/shared";
import { Button } from "@blackbox/ui/button";
import { ListTableRow } from "@renderer/components/list-table-row";
import { PrintButton } from "@renderer/components/print-button";
import { PrintDocument } from "@renderer/components/print-document";
import { getApiErrorMessage } from "@renderer/lib/api/client";
import { loadInventoryOut } from "@renderer/lib/local-db/entity-source";

export function InventoryOutDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const seeded = (
    location.state as { detail?: InventoryOutDetail } | null
  )?.detail;
  const [detail, setDetail] = useState<InventoryOutDetail | null>(
    seeded ?? null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void loadInventoryOut(id)
      .then((row) => {
        if (!cancelled) {
          setDetail(row);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled && !seeded) {
          setError(getApiErrorMessage(err, "Failed to load inventory out"));
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
            {detail.outNumber}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {detail.status} · Inventory out
          </p>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          <PrintButton />
          <Button variant="ghost" onClick={() => navigate("/inventory/out")}>
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
            <dt className="text-muted-foreground">Out date</dt>
            <dd className="font-medium">{detail.outDate}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Reference</dt>
            <dd className="font-medium">{detail.reference || "—"}</dd>
          </div>
        </dl>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Bill</h2>
        <div className="border-border overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Barcode</th>
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">SKU</th>
                <th className="px-4 py-3 font-medium">Qty</th>
                <th className="px-4 py-3 font-medium">Avg cost</th>
                <th className="px-4 py-3 font-medium">Line total</th>
              </tr>
            </thead>
            <tbody>
              {detail.items.map((item) => (
                <ListTableRow key={item.id}>
                  <td className="px-4 py-3 tabular-nums">
                    {item.barcode || "—"}
                  </td>
                  <td className="px-4 py-3">
                    {item.productName}
                    {item.variantName ? ` · ${item.variantName}` : ""}
                  </td>
                  <td className="px-4 py-3">{item.sku}</td>
                  <td className="px-4 py-3 tabular-nums">{item.quantity}</td>
                  <td className="px-4 py-3 tabular-nums">{item.unitCost}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {item.lineTotal.toLocaleString()}
                  </td>
                </ListTableRow>
              ))}
            </tbody>
          </table>
        </div>
        <section className="ml-auto grid max-w-sm gap-2 text-sm">
          <div className="flex justify-between gap-6">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="tabular-nums">
              {detail.subtotal.toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between gap-6 font-medium">
            <span>Total</span>
            <span className="tabular-nums">{detail.total.toLocaleString()}</span>
          </div>
        </section>
      </section>
    </PrintDocument>
  );
}
