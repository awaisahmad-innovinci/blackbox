import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import type { PurchaseOrderDetail } from "@blackbox/shared";
import { Button } from "@blackbox/ui/button";
import { ConfirmDialog } from "@renderer/components/confirm-dialog";
import { ListTableLink, ListTableRow } from "@renderer/components/list-table-row";
import { PrintButton } from "@renderer/components/print-button";
import { PrintDocument } from "@renderer/components/print-document";
import { getApiErrorMessage } from "@renderer/lib/api/client";
import { purchaseOrdersApi } from "@renderer/lib/api/purchase-orders";
import { loadPurchaseOrder } from "@renderer/lib/local-db/entity-source";
import {
  commitLocalChange,
  isDeviceBound,
} from "@renderer/lib/local-db/local-write";
import { syncNow } from "@renderer/lib/sync/sync-status";

export function PurchaseOrderProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const seeded = (location.state as { po?: PurchaseOrderDetail } | null)?.po;
  const [po, setPo] = useState<PurchaseOrderDetail | null>(seeded ?? null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);

  const reload = useCallback(async () => {
    if (!id) return;
    const detail = await loadPurchaseOrder(id);
    setPo(detail);
    setError(null);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void reload().catch((err: unknown) => {
      if (!cancelled && !seeded) {
        setError(getApiErrorMessage(err, "Failed to load purchase order"));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [id, reload, seeded]);

  async function onSubmit() {
    if (!po) return;
    setBusy(true);
    setError(null);
    try {
      if (await isDeviceBound()) {
        const now = new Date().toISOString();
        const updated: PurchaseOrderDetail = {
          ...po,
          status: "SUBMITTED",
          updatedAt: now,
        };
        await commitLocalChange({
          entityType: "purchase_order",
          entityId: po.id,
          operation: "UPSERT",
          payload: updated as unknown as Record<string, unknown>,
        });
        void syncNow();
        setPo(updated);
        return;
      }
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
    setBusy(true);
    setError(null);
    try {
      if (await isDeviceBound()) {
        const now = new Date().toISOString();
        const updated: PurchaseOrderDetail = {
          ...po,
          status: "CANCELLED",
          updatedAt: now,
        };
        await commitLocalChange({
          entityType: "purchase_order",
          entityId: po.id,
          operation: "UPSERT",
          payload: updated as unknown as Record<string, unknown>,
        });
        void syncNow();
        setPo(updated);
        return;
      }
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
    <>
      {error ? (
        <div
          role="alert"
          className="border-destructive/40 bg-destructive/5 text-destructive no-print mb-4 rounded-lg border px-4 py-3 text-sm"
        >
          {error}
        </div>
      ) : null}

      <PrintDocument>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {po.poNumber}
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {po.status.replaceAll("_", " ")} · {po.orderDate}
            </p>
          </div>
          <div className="no-print flex flex-wrap gap-2">
            <PrintButton />
            {canEdit ? (
              <Button
                variant="outline"
                onClick={() => navigate(`/purchase-orders/${po.id}/edit`)}
              >
                Edit
              </Button>
            ) : null}
            {canSubmit ? (
              <Button disabled={busy} onClick={() => setSubmitConfirmOpen(true)}>
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
                onClick={() => setCancelConfirmOpen(true)}
              >
                Cancel PO
              </Button>
            ) : null}
            <Button variant="ghost" onClick={() => navigate("/purchase-orders")}>
              Back
            </Button>
          </div>
        </div>

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
                  </ListTableRow>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid max-w-sm gap-2 text-sm sm:ml-auto">
        <div className="flex justify-between gap-6 border-t pt-2 font-medium">
          <span>Total</span>
          <span className="tabular-nums">{po.total.toLocaleString()}</span>
        </div>
      </section>
      </PrintDocument>

      <ConfirmDialog
        open={submitConfirmOpen}
        onOpenChange={setSubmitConfirmOpen}
        title="Submit this Purchase Order?"
        description={
          po ? (
            <>
              <p>Vendor: {po.vendorName}</p>
              <p>Total: {po.total.toLocaleString()}</p>
              <p>Items: {po.items.length}</p>
            </>
          ) : null
        }
        confirmLabel="Submit PO"
        loading={busy}
        onConfirm={async () => {
          await onSubmit();
          setSubmitConfirmOpen(false);
        }}
      />

      <ConfirmDialog
        open={cancelConfirmOpen}
        onOpenChange={setCancelConfirmOpen}
        title="Cancel purchase order?"
        description={
          po ? `Cancel purchase order ${po.poNumber}?` : null
        }
        confirmLabel="Cancel PO"
        loading={busy}
        onConfirm={async () => {
          await onCancel();
          setCancelConfirmOpen(false);
        }}
      />
    </>
  );
}
