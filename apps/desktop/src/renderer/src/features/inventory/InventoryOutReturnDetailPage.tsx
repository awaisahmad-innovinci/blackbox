import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { InventoryOutReturnDetail } from "@blackbox/shared";
import { Button } from "@blackbox/ui/button";
import { ListTableRow } from "@renderer/components/list-table-row";
import { getApiErrorMessage } from "@renderer/lib/api/client";
import { loadInventoryOutReturn } from "@renderer/lib/local-db/entity-source";

export function InventoryOutReturnDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<InventoryOutReturnDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void loadInventoryOutReturn(id)
      .then((row) => {
        if (!cancelled) {
          setDetail(row);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(getApiErrorMessage(err, "Failed to load return"));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

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
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {detail.returnNumber}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {detail.status} · Inventory out return
          </p>
        </div>
        <Button variant="ghost" onClick={() => navigate("/inventory/out-returns")}>
          Back
        </Button>
      </div>

      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Warehouse</dt>
          <dd>{detail.warehouseName}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Return date</dt>
          <dd>{detail.returnDate}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Total</dt>
          <dd>{detail.total.toFixed(2)}</dd>
        </div>
      </dl>

      <div className="rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left">
              <th className="px-4 py-2">SKU</th>
              <th className="px-4 py-2 text-right">Qty</th>
              <th className="px-4 py-2 text-right">Unit cost</th>
              <th className="px-4 py-2 text-right">Line total</th>
            </tr>
          </thead>
          <tbody>
            {detail.items.map((line) => (
              <ListTableRow key={line.id}>
                <td className="px-4 py-2">
                  <div className="font-medium">{line.sku}</div>
                  <div className="text-muted-foreground text-xs">
                    {line.productName} {line.variantName}
                  </div>
                </td>
                <td className="px-4 py-2 text-right">{line.quantity}</td>
                <td className="px-4 py-2 text-right">{line.unitCost.toFixed(2)}</td>
                <td className="px-4 py-2 text-right">{line.lineTotal.toFixed(2)}</td>
              </ListTableRow>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
