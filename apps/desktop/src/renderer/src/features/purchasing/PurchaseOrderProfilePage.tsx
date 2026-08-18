import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { PurchaseOrderDetail } from "@blackbox/shared";
import { Button } from "@blackbox/ui/button";
import { getApiErrorMessage } from "@renderer/lib/api/client";
import { purchaseOrdersApi } from "@renderer/lib/api/purchase-orders";

export function PurchaseOrderProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [po, setPo] = useState<PurchaseOrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!id) return;
    const detail = await purchaseOrdersApi.get(id);
    setPo(detail);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void reload().catch((err: unknown) => {
      if (!cancelled) {
        setError(getApiErrorMessage(err, "Failed to load purchase order"));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [id, reload]);

  async function onSubmit() {
    if (!po) return;
    const ok = window.confirm(
      `Submit this Purchase Order?\n\nVendor: ${po.vendorName}\nTotal: ${po.total.toLocaleString()}\nItems: ${po.items.length}`,
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await purchaseOrdersApi.submit(po.id);
      try {
        await window.blackbox?.localDb?.upsertPurchaseOrder(updated);
      } catch {
        /* optional */
      }
      setPo(updated);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Failed to submit"));
    } finally {
      setBusy(false);
    }
  }

  async function onCancel() {
    if (!po) return;
    if (!window.confirm(`Cancel purchase order ${po.poNumber}?`)) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await purchaseOrdersApi.cancel(po.id);
      try {
        await window.blackbox?.localDb?.upsertPurchaseOrder(updated);
      } catch {
        /* optional */
      }
      setPo(updated);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Failed to cancel"));
    } finally {
      setBusy(false);
    }
  }

  if (error && !po) {
    return (
      <div
        role="alert"
        className="border-destructive/40 bg-destructive/5 text-destructive rounded-lg border px-4 py-3 text-sm"
      >
        {error}
      </div>
    );
  }

  if (!po) {
    return <p className="text-muted-foreground text-sm">Loading…</p>;
  }

  const canEdit = po.status === "DRAFT";
  const canSubmit = po.status === "DRAFT";
  const canReceive = po.status === "SUBMITTED";
  const canCancel = po.status === "DRAFT" || po.status === "SUBMITTED";

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {po.poNumber}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {po.status.replaceAll("_", " ")} · {po.orderDate}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit ? (
            <Button
              variant="outline"
              onClick={() => navigate(`/purchase-orders/${po.id}/edit`)}
            >
              Edit
            </Button>
          ) : null}
          {canSubmit ? (
            <Button disabled={busy} onClick={() => void onSubmit()}>
              Submit PO
            </Button>
          ) : null}
          {canReceive ? (
            <Button
              onClick={() => navigate(`/purchase-orders/${po.id}/receive`)}
            >
              Receive Stock
            </Button>
          ) : null}
          {canCancel ? (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void onCancel()}
            >
              Cancel PO
            </Button>
          ) : null}
          <Button variant="ghost" onClick={() => navigate("/purchase-orders")}>
            Back
          </Button>
        </div>
      </div>

      {error ? (
        <div
          role="alert"
          className="border-destructive/40 bg-destructive/5 text-destructive rounded-lg border px-4 py-3 text-sm"
        >
          {error}
        </div>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Overview</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Vendor</dt>
            <dd className="font-medium">
              <Link
                to={`/vendors/${po.vendorId}`}
                className="text-primary hover:underline"
              >
                {po.vendorName}
              </Link>
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Warehouse</dt>
            <dd className="font-medium">{po.warehouseName}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Order date</dt>
            <dd className="font-medium">{po.orderDate}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Expected delivery</dt>
            <dd className="font-medium">{po.expectedDate || "—"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">Notes</dt>
            <dd className="font-medium">{po.notes || "—"}</dd>
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
                <th className="px-4 py-3 font-medium">Unit</th>
                <th className="px-4 py-3 font-medium">Qty</th>
                <th className="px-4 py-3 font-medium">Unit cost</th>
                <th className="px-4 py-3 font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {po.items.length === 0 ? (
                <tr className="border-border border-t">
                  <td
                    colSpan={6}
                    className="text-muted-foreground px-4 py-6 text-center"
                  >
                    No items.
                  </td>
                </tr>
              ) : (
                po.items.map((item) => (
                  <tr key={item.id} className="border-border border-t">
                    <td className="px-4 py-3">
                      {item.productName}
                      <div className="text-muted-foreground text-xs">
                        {item.variantName || "—"}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        to={`/skus/${item.productSkuId}`}
                        className="text-primary hover:underline"
                      >
                        {item.sku}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      {item.purchaseUnitName || "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums">{item.quantity}</td>
                    <td className="px-4 py-3 tabular-nums">
                      {item.unitCost.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {item.lineTotal.toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid max-w-sm gap-2 text-sm sm:ml-auto">
        <div className="flex justify-between gap-6">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="tabular-nums">{po.subtotal.toLocaleString()}</span>
        </div>
        <div className="flex justify-between gap-6">
          <span className="text-muted-foreground">Discount</span>
          <span className="tabular-nums">{po.discount.toLocaleString()}</span>
        </div>
        <div className="flex justify-between gap-6">
          <span className="text-muted-foreground">Tax</span>
          <span className="tabular-nums">{po.tax.toLocaleString()}</span>
        </div>
        <div className="flex justify-between gap-6">
          <span className="text-muted-foreground">Other charges</span>
          <span className="tabular-nums">
            {po.otherCharges.toLocaleString()}
          </span>
        </div>
        <div className="flex justify-between gap-6 border-t pt-2 font-medium">
          <span>Grand total</span>
          <span className="tabular-nums">{po.total.toLocaleString()}</span>
        </div>
      </section>
    </div>
  );
}
