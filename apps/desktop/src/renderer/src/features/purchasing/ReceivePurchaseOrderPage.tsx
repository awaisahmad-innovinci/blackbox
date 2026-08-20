import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type {
  GoodsReceiptDetail,
  ReceivingDraft,
  ReceivingLineDraft,
} from "@blackbox/shared";
import { Button } from "@blackbox/ui/button";
import { Input } from "@blackbox/ui/input";
import { Label } from "@blackbox/ui/label";
import { Textarea } from "@blackbox/ui/textarea";
import { getApiErrorMessage } from "@renderer/lib/api/client";
import { goodsReceiptsApi } from "@renderer/lib/api/goods-receipts";
import { purchaseOrdersApi } from "@renderer/lib/api/purchase-orders";
import { syncNow } from "@renderer/lib/sync/sync-status";
import { commitLocalChange, isDeviceBound } from "@renderer/lib/local-db/local-write";
import { loadReceivingDraft } from "@renderer/lib/local-db/entity-source";
import { UpdateVendorSkuPriceDialog } from "./UpdateVendorSkuPriceDialog";

type DraftLine = ReceivingLineDraft & {
  receiveQuantity: number;
  receivingUnitCost: number;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ReceivePurchaseOrderPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [header, setHeader] = useState<Omit<ReceivingDraft, "items"> | null>(
    null,
  );
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [receiptDate, setReceiptDate] = useState(todayIso());
  const [voucherNumber, setVoucherNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [discount, setDiscount] = useState("0");
  const [tax, setTax] = useState("0");
  const [otherCharges, setOtherCharges] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<GoodsReceiptDetail | null>(null);

  const [priceEdit, setPriceEdit] = useState<{
    productLabel: string;
    currentPrice: number;
    currentSellingPrice: number;
    purchaseOrderItemId: string;
  } | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    void loadReceivingDraft(id)
      .then((draft) => {
        if (cancelled) return;
        const { items, ...rest } = draft;
        setHeader(rest);
        setLines(
          items.map((item) => ({
            ...item,
            receiveQuantity: 0,
            receivingUnitCost: item.poUnitCost,
          })),
        );
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(getApiErrorMessage(err, "Failed to load receiving form"));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const subtotal = useMemo(
    () =>
      Math.round(
        lines.reduce(
          (sum, l) => sum + l.receiveQuantity * l.receivingUnitCost,
          0,
        ) * 10000,
      ) / 10000,
    [lines],
  );
  const discountPct = Number(discount) || 0;
  const discountAmount =
    Math.round(((subtotal * discountPct) / 100) * 10000) / 10000;
  const taxN = Number(tax) || 0;
  const otherN = Number(otherCharges) || 0;
  const grandTotal =
    Math.round((subtotal - discountAmount + taxN + otherN) * 10000) / 10000;

  function updateLine(
    purchaseOrderItemId: string,
    patch: Pick<DraftLine, "receiveQuantity">,
  ) {
    setLines((prev) =>
      prev.map((l) =>
        l.purchaseOrderItemId === purchaseOrderItemId ? { ...l, ...patch } : l,
      ),
    );
  }

  async function onConfirm() {
    if (!id || !header) return;
    for (const line of lines) {
      if (line.receiveQuantity < 0) {
        setError("Received quantity must be >= 0");
        return;
      }
      if (line.receiveQuantity > line.orderedQuantity) {
        setError(
          "Received quantity cannot be greater than ordered quantity.",
        );
        return;
      }
      if (line.receivingUnitCost < 0) {
        setError("Receiving unit cost must be >= 0");
        return;
      }
    }
    if (discountPct < 0 || discountPct > 100) {
      setError("Discount % must be between 0 and 100");
      return;
    }

    const ok = window.confirm(
      `Confirm Receiving Voucher?\n\nPO: ${header.poNumber}\nVendor: ${header.vendorName}\nWarehouse: ${header.warehouseName}\nItems: ${lines.length}\nDiscount: ${discountPct}% (${discountAmount.toLocaleString()})\nTotal: ${grandTotal.toLocaleString()}`,
    );
    if (!ok) return;

    setSaving(true);
    setError(null);
    try {
      if (await isDeviceBound()) {
        const localId = crypto.randomUUID();
        const now = new Date().toISOString();
        const receipt: GoodsReceiptDetail = {
          id: localId,
          receiptNumber: `LOCAL-${localId.slice(0, 8)}`,
          purchaseOrderId: id,
          poNumber: header.poNumber,
          vendorId: header.vendorId,
          vendorName: header.vendorName,
          warehouseId: header.warehouseId,
          warehouseName: header.warehouseName,
          status: "POSTED",
          receivedAt: receiptDate,
          voucherNumber: voucherNumber.trim() || null,
          subtotal,
          discount: discountAmount,
          tax: taxN,
          otherCharges: otherN,
          total: grandTotal,
          notes: notes.trim(),
          items: lines.map((l) => ({
            id: crypto.randomUUID(),
            purchaseOrderItemId: l.purchaseOrderItemId,
            productSkuId: l.productSkuId,
            vendorSkuId: l.vendorSkuId,
            productName: l.productName,
            variantName: l.variantName,
            sku: l.sku,
            vendorSkuCode: l.vendorSkuCode,
            purchaseUnitId: l.purchaseUnitId,
            purchaseUnitName: l.purchaseUnitName,
            unitsPerPurchaseUnit: l.unitsPerPurchaseUnit,
            orderedQuantity: l.orderedQuantity,
            receivedQuantity: l.receiveQuantity,
            poUnitCost: l.poUnitCost,
            receivingUnitCost: l.receivingUnitCost,
            lineTotal: l.receiveQuantity * l.receivingUnitCost,
          })),
          createdAt: now,
          updatedAt: now,
        };
        await commitLocalChange({
          entityType: "goods_receipt",
          entityId: localId,
          operation: "UPSERT",
          payload: receipt as unknown as Record<string, unknown>,
        });
        await commitLocalChange({
          entityType: "purchase_order",
          entityId: id,
          operation: "UPSERT",
          payload: {
            id,
            poNumber: header.poNumber,
            vendorId: header.vendorId,
            vendorName: header.vendorName,
            warehouseId: header.warehouseId,
            warehouseName: header.warehouseName,
            status: "RECEIVED",
          },
        });
        for (const line of lines) {
          if (!(line.receiveQuantity > 0)) continue;
          const movementId = crypto.randomUUID();
          const delta =
            line.receiveQuantity *
            (line.unitsPerPurchaseUnit > 0 ? line.unitsPerPurchaseUnit : 1);
          await commitLocalChange({
            entityType: "inventory_movement",
            entityId: movementId,
            operation: "EVENT",
            payload: {
              id: movementId,
              productSkuId: line.productSkuId,
              sku: line.sku,
              variantName: line.variantName,
              warehouseId: header.warehouseId,
              warehouseName: header.warehouseName,
              movementType: "PURCHASE_RECEIPT",
              quantity: delta,
              delta,
              referenceType: "goods_receipt",
              referenceId: localId,
              reason: `Receipt ${receipt.receiptNumber}`,
              createdAt: now,
            },
          });
        }
        void syncNow();
        setSuccess(receipt);
        return;
      }
      const receipt = await goodsReceiptsApi.createReceipt(id, {
        receiptDate,
        voucherNumber: voucherNumber.trim() || null,
        notes: notes.trim(),
        discount: discountAmount,
        tax: taxN,
        otherCharges: otherN,
        items: lines.map((l) => ({
          purchaseOrderItemId: l.purchaseOrderItemId,
          receivedQuantity: l.receiveQuantity,
          receivingUnitCost: l.receivingUnitCost,
        })),
      });

      try {
        await window.blackbox?.localDb?.upsertGoodsReceipt(receipt);
        const po = await purchaseOrdersApi.get(id);
        await window.blackbox?.localDb?.upsertPurchaseOrder(po);
      } catch {
        /* optional cache */
      }

      setSuccess(receipt);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Failed to confirm receiving"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-muted-foreground text-sm">Loading…</p>;
  }

  if (success) {
    return (
      <div className="mx-auto max-w-xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Receiving Voucher Created
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Inventory has been updated for the selected warehouse.
          </p>
        </div>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Receipt</dt>
            <dd className="font-medium">{success.receiptNumber}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Purchase Order</dt>
            <dd className="font-medium">{success.poNumber}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Warehouse</dt>
            <dd className="font-medium">{success.warehouseName}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Total</dt>
            <dd className="font-medium tabular-nums">
              {success.total.toLocaleString()}
            </dd>
          </div>
        </dl>
        <div className="flex flex-wrap gap-3">
          <Button
            onClick={() =>
              navigate(`/goods-receipts/${success.id}`, {
                state: { receipt: success },
              })
            }
          >
            View Receipt
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate("/purchase-orders")}
          >
            Back to Purchase Orders
          </Button>
        </div>
      </div>
    );
  }

  if (!header) {
    return (
      <div
        role="alert"
        className="border-destructive/40 bg-destructive/5 text-destructive rounded-lg border px-4 py-3 text-sm"
      >
        {error ?? "Unable to load receiving form"}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Receive Purchase Order
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Enter received quantities. Confirming posts stock to{" "}
          {header.warehouseName}.
        </p>
      </div>

      {error ? (
        <div
          role="alert"
          className="border-destructive/40 bg-destructive/5 text-destructive rounded-lg border px-4 py-3 text-sm"
        >
          {error}
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Purchase Order</Label>
          <Input value={header.poNumber} disabled />
        </div>
        <div className="space-y-1.5">
          <Label>Vendor</Label>
          <Input value={header.vendorName} disabled />
        </div>
        <div className="space-y-1.5">
          <Label>Warehouse</Label>
          <Input value={header.warehouseName} disabled />
        </div>
        <div className="space-y-1.5">
          <Label>Receipt date</Label>
          <Input
            type="date"
            value={receiptDate}
            onChange={(e) => setReceiptDate(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Voucher number</Label>
          <Input
            value={voucherNumber}
            onChange={(e) => setVoucherNumber(e.target.value)}
            placeholder="optional"
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Items</h2>
        <div className="border-border overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Product</th>
                <th className="px-3 py-2 font-medium">SKU</th>
                <th className="px-3 py-2 font-medium">Ordered</th>
                <th className="px-3 py-2 font-medium">Receive qty</th>
                <th className="px-3 py-2 font-medium">PO price</th>
                <th className="px-3 py-2 font-medium">Total</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                  <tr
                    key={line.purchaseOrderItemId}
                    className="border-border border-t"
                  >
                    <td className="px-3 py-2">
                      {line.productName}
                      <div className="text-muted-foreground text-xs">
                        {line.variantName || "—"}
                      </div>
                    </td>
                    <td className="px-3 py-2">{line.sku}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {line.orderedQuantity} {line.purchaseUnitName || ""}
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        className="h-8 w-24"
                        value={String(line.receiveQuantity)}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          updateLine(line.purchaseOrderItemId, {
                            receiveQuantity: Number.isNaN(n)
                              ? line.receiveQuantity
                              : n,
                          });
                        }}
                      />
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {line.receivingUnitCost.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {(
                        line.receiveQuantity * line.receivingUnitCost
                      ).toLocaleString()}
                    </td>
                    <td className="px-3 py-2">
                      {line.vendorSkuId ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setPriceEdit({
                              productLabel: `${line.productName} · ${line.sku}`,
                              currentPrice: line.receivingUnitCost,
                              currentSellingPrice: line.currentSellingPrice,
                              purchaseOrderItemId: line.purchaseOrderItemId,
                            })
                          }
                        >
                          Update SKU Price
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid max-w-sm gap-3 text-sm sm:ml-auto">
        <div className="flex justify-between gap-6">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="tabular-nums">{subtotal.toLocaleString()}</span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <Label htmlFor="discount">Discount %</Label>
          <Input
            id="discount"
            className="h-8 w-28"
            value={discount}
            onChange={(e) => setDiscount(e.target.value)}
          />
        </div>
        <div className="flex justify-between gap-6">
          <span className="text-muted-foreground">Discount amount</span>
          <span className="tabular-nums">
            {discountAmount.toLocaleString()}
          </span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <Label htmlFor="tax">Tax</Label>
          <Input
            id="tax"
            className="h-8 w-28"
            value={tax}
            onChange={(e) => setTax(e.target.value)}
          />
        </div>
        <div className="flex items-center justify-between gap-6">
          <Label htmlFor="other">Other charges</Label>
          <Input
            id="other"
            className="h-8 w-28"
            value={otherCharges}
            onChange={(e) => setOtherCharges(e.target.value)}
          />
        </div>
        <div className="flex justify-between gap-6 border-t pt-2 font-medium">
          <span>Grand total</span>
          <span className="tabular-nums">{grandTotal.toLocaleString()}</span>
        </div>
      </section>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          disabled={saving}
          onClick={() => void onConfirm()}
        >
          {saving ? "Confirming…" : "Confirm Receiving"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => navigate(`/purchase-orders/${id}`)}
        >
          Cancel
        </Button>
      </div>

      {priceEdit ? (
        <UpdateVendorSkuPriceDialog
          open
          purchaseOrderId={header.purchaseOrderId}
          purchaseOrderItemId={priceEdit.purchaseOrderItemId}
          productLabel={priceEdit.productLabel}
          currentPrice={priceEdit.currentPrice}
          currentSellingPrice={priceEdit.currentSellingPrice}
          onClose={() => setPriceEdit(null)}
          onSaved={(newPrice, newSellingPrice) => {
            setLines((prev) =>
              prev.map((l) =>
                l.purchaseOrderItemId === priceEdit.purchaseOrderItemId
                  ? {
                      ...l,
                      poUnitCost: newPrice,
                      receivingUnitCost: newPrice,
                      currentVendorPurchasePrice: newPrice,
                      currentSellingPrice: newSellingPrice,
                    }
                  : l,
              ),
            );
          }}
        />
      ) : null}
    </div>
  );
}
