import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type {
  InventoryOutDetail,
  WarehouseListItem,
} from "@blackbox/shared";
import { Button } from "@blackbox/ui/button";
import { Input } from "@blackbox/ui/input";
import { Label } from "@blackbox/ui/label";
import { Textarea } from "@blackbox/ui/textarea";
import { getApiErrorMessage } from "@renderer/lib/api/client";
import { inventoryOutApi } from "@renderer/lib/api/inventory-out";
import { syncNow } from "@renderer/lib/sync/sync-status";
import { commitLocalChange, isDeviceBound } from "@renderer/lib/local-db/local-write";
import {
  loadSkuByBarcode,
  loadWarehouses,
} from "@renderer/lib/local-db/entity-source";
import {
  AddInventoryOutItemDialog,
  type DraftOutLine,
} from "./AddInventoryOutItemDialog";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function lineTotal(line: DraftOutLine): number {
  return round4(line.quantity * line.costPrice);
}

export function InventoryOutPage() {
  const navigate = useNavigate();
  const barcodeRef = useRef<HTMLInputElement>(null);

  const [warehouses, setWarehouses] = useState<WarehouseListItem[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [outDate, setOutDate] = useState(todayIso());
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftOutLine[]>([]);
  const [itemOpen, setItemOpen] = useState(false);
  const [barcode, setBarcode] = useState("");
  const [scanBusy, setScanBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<InventoryOutDetail | null>(null);

  useEffect(() => {
    void loadWarehouses()
      .then((rows) => {
        setWarehouses(rows);
        if (rows.length === 1) setWarehouseId(rows[0]!.id);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (warehouseId && !success) {
      barcodeRef.current?.focus();
    }
  }, [warehouseId, success, lines.length]);

  const existingSkuIds = useMemo(
    () => lines.map((l) => l.productSkuId),
    [lines],
  );

  const subtotal = useMemo(
    () => round4(lines.reduce((sum, l) => sum + lineTotal(l), 0)),
    [lines],
  );
  const total = subtotal;

  const canPost = useMemo(
    () =>
      lines.length > 0 &&
      lines.every((l) => l.quantity > 0 && l.quantity <= l.quantityAvailable),
    [lines],
  );

  function upsertScannedLine(row: {
    id: string;
    productName: string;
    variantName: string;
    sku: string;
    barcode: string | null;
    quantityAvailable: number;
    costPrice: number;
  }): string | null {
    const available = row.quantityAvailable;
    if (available <= 0) {
      return `No available quantity for ${row.sku}`;
    }

    const existing = lines.find((l) => l.productSkuId === row.id);
    if (existing) {
      const nextQty = round4(existing.quantity + 1);
      if (nextQty > available) {
        return `Cannot exceed available (${available}) for ${row.sku}`;
      }
      setLines((prev) =>
        prev.map((l) =>
          l.productSkuId === row.id ? { ...l, quantity: nextQty } : l,
        ),
      );
      return null;
    }

    setLines((prev) => [
      ...prev,
      {
        productSkuId: row.id,
        productName: row.productName,
        variantName: row.variantName,
        sku: row.sku,
        barcode: row.barcode,
        quantity: 1,
        quantityAvailable: available,
        costPrice: row.costPrice,
      },
    ]);
    return null;
  }

  async function onBarcodeEnter() {
    setError(null);
    const code = barcode.trim();
    if (!warehouseId) {
      setError("Select a warehouse first");
      return;
    }
    if (!code || scanBusy) return;

    setScanBusy(true);
    try {
      const row = await loadSkuByBarcode(code, warehouseId);
      const err = upsertScannedLine({
        id: row.id,
        productName: row.productName,
        variantName: row.variantName,
        sku: row.sku,
        barcode: row.barcode,
        quantityAvailable: row.quantityAvailable ?? 0,
        costPrice: row.costPrice ?? 0,
      });
      if (err) {
        setError(err);
      } else {
        setBarcode("");
      }
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "SKU not found for barcode"));
    } finally {
      setScanBusy(false);
      requestAnimationFrame(() => barcodeRef.current?.focus());
    }
  }

  async function onConfirm() {
    setError(null);
    if (!warehouseId) {
      setError("Select a warehouse");
      return;
    }
    if (lines.length === 0) {
      setError("Add at least one SKU");
      return;
    }
    for (const line of lines) {
      if (!(line.quantity > 0) || line.quantity > line.quantityAvailable) {
        setError(
          `Invalid quantity for ${line.sku}: must be between 0 and ${line.quantityAvailable}`,
        );
        return;
      }
    }

    setSaving(true);
    try {
      if (await isDeviceBound()) {
        const localId = crypto.randomUUID();
        const now = new Date().toISOString();
        const warehouseName =
          warehouses.find((w) => w.id === warehouseId)?.name ?? "";
        const items = lines.map((l) => ({
          id: crypto.randomUUID(),
          productSkuId: l.productSkuId,
          productName: l.productName,
          variantName: l.variantName,
          sku: l.sku,
          barcode: l.barcode,
          quantity: l.quantity,
          unitCost: l.costPrice,
          lineTotal: lineTotal(l),
        }));
        const detail: InventoryOutDetail = {
          id: localId,
          outNumber: `LOCAL-${localId.slice(0, 8)}`,
          warehouseId,
          warehouseName,
          outDate,
          reference: reference.trim() || null,
          notes: notes.trim(),
          status: "POSTED",
          subtotal: items.reduce((sum, i) => sum + i.lineTotal, 0),
          total: items.reduce((sum, i) => sum + i.lineTotal, 0),
          items,
          createdAt: now,
          updatedAt: now,
        };
        await commitLocalChange({
          entityType: "inventory_out",
          entityId: localId,
          operation: "UPSERT",
          payload: detail as unknown as Record<string, unknown>,
        });
        for (const item of items) {
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
              movementType: "INVENTORY_OUT",
              quantity: item.quantity,
              delta: -item.quantity,
              referenceType: "inventory_out",
              referenceId: localId,
              reason: `Inventory out ${detail.outNumber}`,
              createdAt: now,
            },
          });
        }
        void syncNow();
        setSuccess(detail);
        return;
      }
      const detail = await inventoryOutApi.create({
        warehouseId,
        outDate,
        reference: reference.trim() || null,
        notes: notes.trim(),
        items: lines.map((l) => ({
          productSkuId: l.productSkuId,
          quantity: l.quantity,
        })),
      });

      try {
        await window.blackbox?.localDb?.upsertInventoryOut(detail);
      } catch {
        /* optional cache */
      }

      setSuccess(detail);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Failed to post inventory out"));
    } finally {
      setSaving(false);
    }
  }

  if (success) {
    return (
      <div className="space-y-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {success.outNumber}
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Inventory out posted · {success.status}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() =>
                navigate(`/inventory/out/${success.id}`, {
                  state: { detail: success },
                })
              }
            >
              View detail
            </Button>
            <Button variant="ghost" onClick={() => navigate("/")}>
              Back
            </Button>
          </div>
        </div>

        <section className="space-y-3">
          <h2 className="text-lg font-medium">Overview</h2>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Warehouse</dt>
              <dd className="font-medium">{success.warehouseName}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Out date</dt>
              <dd className="font-medium">{success.outDate}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Reference</dt>
              <dd className="font-medium">{success.reference || "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Notes</dt>
              <dd className="font-medium">{success.notes || "—"}</dd>
            </div>
          </dl>
        </section>

        <InventoryOutBillTable
          items={success.items.map((item) => ({
            key: item.id,
            barcode: item.barcode,
            productLabel: `${item.productName}${item.variantName ? ` · ${item.variantName}` : ""}`,
            sku: item.sku,
            quantity: item.quantity,
            unitCost: item.unitCost,
            lineTotal: item.lineTotal,
          }))}
          subtotal={success.subtotal}
          total={success.total}
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Inventory Out</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Scan barcodes or add SKUs to build the out bill, then confirm.
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
          <Label htmlFor="warehouse">Warehouse</Label>
          <select
            id="warehouse"
            className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
            value={warehouseId}
            onChange={(e) => {
              setWarehouseId(e.target.value);
              setLines([]);
              setBarcode("");
              setError(null);
            }}
          >
            <option value="">Select warehouse…</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="outDate">Out date</Label>
          <Input
            id="outDate"
            type="date"
            value={outDate}
            onChange={(e) => setOutDate(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="reference">Reference (optional)</Label>
          <Input
            id="reference"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Ticket / reason code"
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="notes">Notes (optional)</Label>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
          />
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-medium">Bill</h2>
          <Button
            type="button"
            variant="outline"
            disabled={!warehouseId}
            onClick={() => setItemOpen(true)}
          >
            Add SKU
          </Button>
        </div>

        <div className="border-border overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Barcode</th>
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">SKU</th>
                <th className="px-4 py-3 font-medium">Available</th>
                <th className="px-4 py-3 font-medium">Avg cost</th>
                <th className="px-4 py-3 font-medium">Qty</th>
                <th className="px-4 py-3 font-medium">Line total</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.productSkuId} className="border-border border-t">
                  <td className="px-4 py-3 tabular-nums">
                    {line.barcode || "—"}
                  </td>
                  <td className="px-4 py-3">
                    {line.productName}
                    {line.variantName ? ` · ${line.variantName}` : ""}
                  </td>
                  <td className="px-4 py-3">{line.sku}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {line.quantityAvailable}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{line.costPrice}</td>
                  <td className="px-4 py-3 align-top">
                    <Input
                      className="h-8 w-24"
                      value={String(line.quantity)}
                      aria-invalid={
                        line.quantity <= 0 ||
                        line.quantity > line.quantityAvailable
                      }
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        setLines((prev) =>
                          prev.map((l) =>
                            l.productSkuId === line.productSkuId
                              ? {
                                  ...l,
                                  quantity: Number.isNaN(n) ? 0 : n,
                                }
                              : l,
                          ),
                        );
                      }}
                    />
                    {line.quantity > line.quantityAvailable ? (
                      <p className="text-destructive mt-1 text-xs">
                        Quantity must be at most {line.quantityAvailable}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {lineTotal(line).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right">
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

              <tr className="border-border border-t bg-muted/20">
                <td className="px-4 py-3" colSpan={1}>
                  <Input
                    ref={barcodeRef}
                    className="h-8"
                    value={barcode}
                    disabled={!warehouseId || scanBusy}
                    placeholder={
                      warehouseId
                        ? "Scan barcode…"
                        : "Select warehouse first"
                    }
                    onChange={(e) => setBarcode(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void onBarcodeEnter();
                      }
                    }}
                  />
                </td>
                <td
                  colSpan={7}
                  className="text-muted-foreground px-4 py-3 text-sm"
                >
                  Press Enter after scan to add / increment qty by 1
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <section className="ml-auto grid max-w-sm gap-2 text-sm">
          <div className="flex justify-between gap-6">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="tabular-nums">{subtotal.toLocaleString()}</span>
          </div>
          <div className="flex justify-between gap-6 font-medium">
            <span>Total</span>
            <span className="tabular-nums">{total.toLocaleString()}</span>
          </div>
        </section>
      </section>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => navigate("/")}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={saving || !canPost}
          onClick={() => void onConfirm()}
        >
          {saving ? "Posting…" : "Confirm out"}
        </Button>
      </div>

      <AddInventoryOutItemDialog
        open={itemOpen}
        warehouseId={warehouseId}
        existingSkuIds={existingSkuIds}
        onClose={() => setItemOpen(false)}
        onAddMany={(added) => {
          setLines((prev) => [...prev, ...added]);
          setItemOpen(false);
        }}
      />
    </div>
  );
}

function InventoryOutBillTable({
  items,
  subtotal,
  total,
}: {
  items: Array<{
    key: string;
    barcode: string | null;
    productLabel: string;
    sku: string;
    quantity: number;
    unitCost: number;
    lineTotal: number;
  }>;
  subtotal: number;
  total: number;
}) {
  return (
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
            {items.map((item) => (
              <tr key={item.key} className="border-border border-t">
                <td className="px-4 py-3 tabular-nums">
                  {item.barcode || "—"}
                </td>
                <td className="px-4 py-3">{item.productLabel}</td>
                <td className="px-4 py-3">{item.sku}</td>
                <td className="px-4 py-3 tabular-nums">{item.quantity}</td>
                <td className="px-4 py-3 tabular-nums">{item.unitCost}</td>
                <td className="px-4 py-3 tabular-nums">
                  {item.lineTotal.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section className="ml-auto grid max-w-sm gap-2 text-sm">
        <div className="flex justify-between gap-6">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="tabular-nums">{subtotal.toLocaleString()}</span>
        </div>
        <div className="flex justify-between gap-6 font-medium">
          <span>Total</span>
          <span className="tabular-nums">{total.toLocaleString()}</span>
        </div>
      </section>
    </section>
  );
}
