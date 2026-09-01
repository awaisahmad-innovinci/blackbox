import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type {
  VendorReturnDetail,
  VendorReturnReason,
  VendorListItem,
  WarehouseListItem,
} from "@blackbox/shared";
import { VENDOR_RETURN_REASONS, VENDOR_RETURN_REASON_LABELS } from "@blackbox/shared";
import { Button } from "@blackbox/ui/button";
import { Input } from "@blackbox/ui/input";
import { Label } from "@blackbox/ui/label";
import { Textarea } from "@blackbox/ui/textarea";
import { getApiErrorMessage } from "@renderer/lib/api/client";
import { vendorReturnsApi } from "@renderer/lib/api/vendor-returns";
import { useBarcodeScanTarget } from "@renderer/lib/barcode-scan";
import { syncNow } from "@renderer/lib/sync/sync-status";
import { commitLocalChange, isDeviceBound } from "@renderer/lib/local-db/local-write";
import {
  loadLastPurchaseCost,
  loadSkuByBarcode,
  loadVendorSkus,
  loadVendors,
  loadWarehouses,
} from "@renderer/lib/local-db/entity-source";
import {
  AddVendorReturnItemDialog,
  toDraftReturnLine,
  type DraftReturnLine,
} from "./AddVendorReturnItemDialog";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export function VendorReturnFormPage() {
  const navigate = useNavigate();
  const [vendors, setVendors] = useState<VendorListItem[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseListItem[]>([]);
  const [vendorId, setVendorId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [returnDate, setReturnDate] = useState(todayIso());
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftReturnLine[]>([]);
  const [itemOpen, setItemOpen] = useState(false);
  const [barcode, setBarcode] = useState("");
  const [scanBusy, setScanBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<VendorReturnDetail | null>(null);
  const barcodeRef = useRef<HTMLInputElement>(null);

  function focusQty(productSkuId: string) {
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLInputElement>(
        `[data-sku-qty="${productSkuId}"]`,
      );
      el?.focus();
      el?.select();
    });
  }

  function updateLine(
    productSkuId: string,
    patch: Partial<Pick<DraftReturnLine, "quantity" | "reason">>,
  ) {
    setLines((prev) =>
      prev.map((l) => {
        if (l.productSkuId !== productSkuId) return l;
        const next = { ...l, ...patch };
        if ("quantity" in patch) {
          next.lineTotal = round4(next.quantity * next.unitCost);
        }
        return next;
      }),
    );
  }

  async function addSkuFromBarcode(code: string) {
    const trimmed = code.trim();
    if (!trimmed || scanBusy) return;
    if (!vendorId || !warehouseId) {
      setError("Select vendor and warehouse first");
      return;
    }

    setScanBusy(true);
    setError(null);
    try {
      const rows = await loadVendorSkus(vendorId, trimmed, warehouseId);
      const exact = rows.filter((r) => (r.barcode ?? "").trim() === trimmed);
      if (exact.length === 0) {
        try {
          await loadSkuByBarcode(trimmed, warehouseId);
          setError("This SKU does not belong to the selected vendor");
        } catch {
          setError("No SKU found for this barcode");
        }
        return;
      }
      if (exact.length > 1) {
        setError("Multiple SKUs match this barcode");
        return;
      }
      const match = exact[0]!;
      if (lines.some((l) => l.productSkuId === match.productSkuId)) {
        setBarcode("");
        focusQty(match.productSkuId);
        return;
      }
      const available = match.quantityAvailable ?? 0;
      if (available <= 0) {
        setError(`No stock available for ${match.sku}`);
        return;
      }
      let unitCost = match.purchasePrice;
      try {
        unitCost = await loadLastPurchaseCost(vendorId, match.productSkuId);
      } catch {
        /* fallback to purchasePrice */
      }
      setLines((prev) => [...prev, toDraftReturnLine(match, unitCost)]);
      setBarcode("");
      focusQty(match.productSkuId);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Barcode lookup failed"));
    } finally {
      setScanBusy(false);
      requestAnimationFrame(() => barcodeRef.current?.focus());
    }
  }

  useBarcodeScanTarget({
    kind: "barcode",
    enabled: Boolean(vendorId && warehouseId && !itemOpen && !success),
    onScan: setBarcode,
    onComplete: (code) => {
      void addSkuFromBarcode(code);
    },
  });

  useEffect(() => {
    void loadVendors({ status: "active", pageSize: 100 })
      .then((r) => setVendors(r.items))
      .catch(() => undefined);
    void loadWarehouses().then((rows) => {
      setWarehouses(rows);
      if (rows.length === 1) setWarehouseId(rows[0]!.id);
    }).catch(() => undefined);
  }, []);

  const subtotal = useMemo(
    () => round4(lines.reduce((sum, l) => sum + l.lineTotal, 0)),
    [lines],
  );

  async function onConfirm() {
    setError(null);
    if (!vendorId) {
      setError("Select a vendor");
      return;
    }
    if (!warehouseId) {
      setError("Select a warehouse");
      return;
    }
    if (lines.length === 0) {
      setError("Add at least one item");
      return;
    }
    for (const line of lines) {
      const stockNeeded = line.quantity * line.unitsPerPurchaseUnit;
      if (!(line.quantity > 0)) {
        setError(`Enter a quantity greater than 0 for ${line.sku}`);
        return;
      }
      if (stockNeeded > line.quantityAvailable) {
        setError(
          `Invalid quantity for ${line.sku}: exceeds available stock`,
        );
        return;
      }
    }

    const ok = window.confirm(
      `Post vendor return?\n\nVendor: ${vendors.find((v) => v.id === vendorId)?.name ?? ""}\nItems: ${lines.length}\nTotal: ${subtotal.toLocaleString()}`,
    );
    if (!ok) return;

    setSaving(true);
    try {
      if (await isDeviceBound()) {
        const localId = crypto.randomUUID();
        const now = new Date().toISOString();
        const vendorName = vendors.find((v) => v.id === vendorId)?.name ?? "";
        const warehouseName =
          warehouses.find((w) => w.id === warehouseId)?.name ?? "";
        const items = lines.map((l) => ({
          id: crypto.randomUUID(),
          productSkuId: l.productSkuId,
          vendorSkuId: l.vendorSkuId,
          productName: l.productName,
          variantName: l.variantName,
          sku: l.sku,
          barcode: l.barcode,
          purchaseUnitId: l.purchaseUnitId,
          purchaseUnitName: l.purchaseUnitName,
          unitsPerPurchaseUnit: l.unitsPerPurchaseUnit,
          quantity: l.quantity,
          unitCost: l.unitCost,
          lineTotal: l.lineTotal,
          reason: l.reason,
          settlement: null,
          goodsReceiptId: null,
        }));
        const detail: VendorReturnDetail = {
          id: localId,
          returnNumber: `LOCAL-${localId.slice(0, 8)}`,
          vendorId,
          vendorName,
          warehouseId,
          warehouseName,
          returnDate,
          notes: notes.trim(),
          status: "OPEN",
          subtotal,
          total: subtotal,
          items,
          createdAt: now,
          updatedAt: now,
        };
        await commitLocalChange({
          entityType: "vendor_return",
          entityId: localId,
          operation: "UPSERT",
          payload: detail as unknown as Record<string, unknown>,
        });
        for (const item of items) {
          const stockDelta = round4(
            item.quantity * item.unitsPerPurchaseUnit,
          );
          const movementId = crypto.randomUUID();
          await commitLocalChange({
            entityType: "inventory_movement",
            entityId: movementId,
            operation: "EVENT",
            payload: {
              id: movementId,
              productSkuId: item.productSkuId,
              sku: item.sku,
              variantName: item.variantName,
              warehouseId,
              warehouseName,
              movementType: "RETURN",
              quantity: stockDelta,
              delta: -stockDelta,
              referenceType: "vendor_return",
              referenceId: localId,
              reason: `Return ${detail.returnNumber}`,
              createdAt: now,
            },
          });
        }
        void syncNow();
        setSuccess(detail);
        return;
      }

      const detail = await vendorReturnsApi.create({
        vendorId,
        warehouseId,
        returnDate,
        notes: notes.trim(),
        items: lines.map((l) => ({
          productSkuId: l.productSkuId,
          vendorSkuId: l.vendorSkuId,
          quantity: l.quantity,
          unitCost: l.unitCost,
          reason: l.reason,
        })),
      });
      try {
        await window.blackbox?.localDb?.upsertVendorReturn(detail);
      } catch {
        /* optional cache */
      }
      setSuccess(detail);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Failed to post vendor return"));
    } finally {
      setSaving(false);
    }
  }

  if (success) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Return Posted
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {success.returnNumber} · Stock removed at purchase cost
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button
            onClick={() =>
              navigate(`/inventory/returns/${success.id}`, {
                state: { detail: success },
              })
            }
          >
            View return
          </Button>
          <Button variant="outline" onClick={() => navigate("/inventory/returns")}>
            Back to list
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New Vendor Return</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Mark SKUs returned to a vendor. Stock is removed immediately at the
          purchase unit cost you enter.
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
          <Label>Vendor</Label>
          <select
            className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
            value={vendorId}
            onChange={(e) => setVendorId(e.target.value)}
          >
            <option value="">Select vendor</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Warehouse</Label>
          <select
            className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
            value={warehouseId}
            onChange={(e) => setWarehouseId(e.target.value)}
          >
            <option value="">Select warehouse</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Return date</Label>
          <Input
            type="date"
            value={returnDate}
            onChange={(e) => setReturnDate(e.target.value)}
          />
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-medium">Items</h2>
          <Button
            type="button"
            variant="outline"
            disabled={!vendorId || !warehouseId}
            onClick={() => setItemOpen(true)}
          >
            Add items
          </Button>
        </div>
        <div className="border-border overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Product</th>
                <th className="px-3 py-2 font-medium">SKU</th>
                <th className="px-3 py-2 font-medium">Reason</th>
                <th className="px-3 py-2 font-medium">Qty</th>
                <th className="px-3 py-2 font-medium">Unit cost</th>
                <th className="px-3 py-2 font-medium">Total</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 && !(vendorId && warehouseId) ? (
                <tr>
                  <td
                    colSpan={7}
                    className="text-muted-foreground px-3 py-4 text-sm"
                  >
                    No items yet.
                  </td>
                </tr>
              ) : null}
              {lines.map((line) => (
                <tr
                  key={line.productSkuId}
                  className="border-border border-t"
                >
                  <td className="px-3 py-2">
                    {line.productName}
                    <div className="text-muted-foreground text-xs">
                      {line.variantName || "—"}
                    </div>
                  </td>
                  <td className="px-3 py-2">{line.sku}</td>
                  <td className="px-3 py-2">
                    <select
                      className="border-input bg-background h-8 min-w-[7rem] rounded-md border px-2 text-sm"
                      value={line.reason}
                      onChange={(e) =>
                        updateLine(line.productSkuId, {
                          reason: e.target.value as VendorReturnReason,
                        })
                      }
                    >
                      {VENDOR_RETURN_REASONS.map((r) => (
                        <option key={r} value={r}>
                          {VENDOR_RETURN_REASON_LABELS[r]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <Input
                        className="h-8 w-20"
                        data-sku-qty={line.productSkuId}
                        value={String(line.quantity)}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => {
                          const quantity = Number(e.target.value);
                          updateLine(line.productSkuId, {
                            quantity: Number.isNaN(quantity)
                              ? line.quantity
                              : quantity,
                          });
                        }}
                      />
                      <span className="text-muted-foreground text-xs whitespace-nowrap">
                        {line.purchaseUnitName || ""}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {line.unitCost.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {line.lineTotal.toLocaleString()}
                  </td>
                  <td className="px-3 py-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setLines((prev) =>
                          prev.filter(
                            (l) => l.productSkuId !== line.productSkuId,
                          ),
                        )
                      }
                    >
                      Remove
                    </Button>
                  </td>
                </tr>
              ))}
              {vendorId && warehouseId ? (
                <tr className="border-border bg-muted/30 border-t">
                  <td className="px-3 py-2" colSpan={3}>
                    <Input
                      ref={barcodeRef}
                      className="h-8"
                      value={barcode}
                      placeholder="Scan barcode to add item"
                      onChange={(e) => setBarcode(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        e.preventDefault();
                        e.stopPropagation();
                        void addSkuFromBarcode(barcode);
                      }}
                    />
                  </td>
                  <td
                    className="text-muted-foreground px-3 py-2 text-xs"
                    colSpan={4}
                  >
                    {scanBusy
                      ? "Looking up…"
                      : "Scan or type a barcode, then press Enter."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid max-w-sm gap-2 text-sm sm:ml-auto">
        <div className="flex justify-between gap-6 border-t pt-2 font-medium">
          <span>Total</span>
          <span className="tabular-nums">{subtotal.toLocaleString()}</span>
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
        <Button type="button" disabled={saving} onClick={() => void onConfirm()}>
          {saving ? "Posting…" : "Post return"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => navigate("/inventory/returns")}
        >
          Cancel
        </Button>
      </div>

      {itemOpen ? (
        <AddVendorReturnItemDialog
          open
          vendorId={vendorId}
          warehouseId={warehouseId}
          existingSkuIds={lines.map((l) => l.productSkuId)}
          onClose={() => setItemOpen(false)}
          onAddMany={(newLines) =>
            setLines((prev) => [...prev, ...newLines])
          }
        />
      ) : null}
    </div>
  );
}
