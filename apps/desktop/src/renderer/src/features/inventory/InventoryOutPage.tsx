import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type {
  InventoryOutDetail,
  SellUnit,
  SkuSearchResult,
  WarehouseListItem,
} from "@blackbox/shared";
import { lineTotalForScan } from "@blackbox/shared";
import { FORM_GRID } from "@renderer/lib/form-layout";
import {
  FormEnterNav,
  formDatePickerProps,
  formSelectPickerProps,
} from "@renderer/components/form-enter-nav";
import { Button } from "@blackbox/ui/button";
import { Input } from "@blackbox/ui/input";
import { Label } from "@blackbox/ui/label";
import { PrintButton } from "@renderer/components/print-button";
import { PrintDocument } from "@renderer/components/print-document";
import { ScanBarcodePanel } from "@renderer/components/scan-barcode-panel";
import {
  KEYBOARD_HINT_ADD,
  KEYBOARD_HINT_ENTER,
  KEYBOARD_HINT_SAVE,
  KEYBOARD_HINT_SCAN,
  KeyboardHints,
} from "@renderer/components/keyboard-hints";
import { confirmRemoveTableLine } from "@renderer/lib/confirm-remove-line";
import { focusLineQty } from "@renderer/lib/focus-line-qty";
import { usePageKeyboard } from "@renderer/lib/use-page-keyboard";
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
  const pricing = lineTotalForScan({
    quantityMultiplier:
      line.lastScanMultiplier ??
      (line.sellUnit === "box" ? line.unitsPerPurchaseUnit : 1),
    unitsPerPurchaseUnit: line.unitsPerPurchaseUnit,
    sellingPrice: line.sellingPrice,
    sellingPricePerPurchaseUnit: line.sellingPricePerPurchaseUnit,
    quantity: line.quantity,
    sellUnit: line.sellUnit,
  });
  return pricing.lineTotal > 0 ? pricing.lineTotal : round4(line.quantity * line.costPrice);
}

function unitPrice(line: DraftOutLine): number {
  const pricing = lineTotalForScan({
    quantityMultiplier:
      line.lastScanMultiplier ??
      (line.sellUnit === "box" ? line.unitsPerPurchaseUnit : 1),
    unitsPerPurchaseUnit: line.unitsPerPurchaseUnit,
    sellingPrice: line.sellingPrice,
    sellingPricePerPurchaseUnit: line.sellingPricePerPurchaseUnit,
    quantity: line.quantity,
    sellUnit: line.sellUnit,
  });
  return pricing.unitPrice > 0 ? pricing.unitPrice : line.costPrice;
}

function quantityHint(line: DraftOutLine): string | null {
  if (line.unitsPerPurchaseUnit <= 1 || line.quantity <= 0) return null;
  const boxes = round4(line.quantity / line.unitsPerPurchaseUnit);
  if (line.sellUnit === "box") {
    return `${line.quantity} ${line.baseUnitName ?? "pcs"} (${boxes} ${line.purchaseUnitName ?? "box"})`;
  }
  if (line.quantity >= line.unitsPerPurchaseUnit) {
    return `${line.quantity} ${line.baseUnitName ?? "pcs"} (${boxes} ${line.purchaseUnitName ?? "box"})`;
  }
  return null;
}

export function InventoryOutPage() {
  const navigate = useNavigate();

  const [warehouses, setWarehouses] = useState<WarehouseListItem[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [outDate, setOutDate] = useState(todayIso());
  const [reference, setReference] = useState("");
  const [lines, setLines] = useState<DraftOutLine[]>([]);
  const [itemOpen, setItemOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanBusy, setScanBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<InventoryOutDetail | null>(null);
  const warehouseRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    void loadWarehouses()
      .then((rows) => {
        setWarehouses(rows);
        if (rows.length > 0) {
          setWarehouseId((current) => current || rows[0]!.id);
        }
        requestAnimationFrame(() => warehouseRef.current?.focus());
      })
      .catch(() => undefined);
  }, []);

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

  function upsertScannedLine(row: SkuSearchResult): string | null {
    const available = row.quantityAvailable ?? 0;
    if (available <= 0) {
      return `No available quantity for ${row.sku}`;
    }

    const multiplier = row.scannedQuantityMultiplier ?? 1;
    const unitsPerPurchaseUnit = row.unitsPerPurchaseUnit ?? 1;
    const sellUnit: SellUnit =
      multiplier > 1 && multiplier >= unitsPerPurchaseUnit ? "box" : "pc";

    const existing = lines.find((l) => l.productSkuId === row.id);
    if (existing) {
      const nextQty = round4(existing.quantity + multiplier);
      if (nextQty > available) {
        return `Cannot exceed available (${available}) for ${row.sku}`;
      }
      setLines((prev) =>
        prev.map((l) =>
          l.productSkuId === row.id
            ? {
                ...l,
                quantity: nextQty,
                sellUnit,
                lastScanMultiplier: multiplier,
              }
            : l,
        ),
      );
      focusLineQty(row.id);
      return null;
    }

    if (multiplier > available) {
      return `Cannot exceed available (${available}) for ${row.sku}`;
    }

    setLines((prev) => [
      ...prev,
      {
        productSkuId: row.id,
        productName: row.productName,
        variantName: row.variantName,
        sku: row.sku,
        barcode: row.barcode,
        quantity: multiplier,
        quantityAvailable: available,
        costPrice: row.costPrice ?? 0,
        unitsPerPurchaseUnit,
        baseUnitName: row.baseUnitName ?? null,
        purchaseUnitName: row.purchaseUnitName ?? null,
        sellingPrice: row.sellingPrice ?? row.costPrice ?? 0,
        sellingPricePerPurchaseUnit: row.sellingPricePerPurchaseUnit ?? null,
        sellUnit,
        lastScanMultiplier: multiplier,
      },
    ]);
    focusLineQty(row.id);
    return null;
  }

  async function onBarcodeEnter(scannedCode: string) {
    setError(null);
    const code = scannedCode.trim();
    if (!warehouseId) {
      setError("Select a warehouse first");
      return;
    }
    if (!code || scanBusy) return;

    setScanBusy(true);
    try {
      const row = await loadSkuByBarcode(code, warehouseId);
      const err = upsertScannedLine(row);
      if (err) {
        setError(err);
      }
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "SKU not found for barcode"));
    } finally {
      setScanBusy(false);
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
          unitCost: unitPrice(l),
          lineTotal: lineTotal(l),
        }));
        const detail: InventoryOutDetail = {
          id: localId,
          outNumber: `LOCAL-${localId.slice(0, 8)}`,
          warehouseId,
          warehouseName,
          outDate,
          reference: reference.trim() || null,
          notes: "",
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
        notes: "",
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

  usePageKeyboard({
    enabled: !success,
    onSave: () => {
      if (!saving && canPost) void onConfirm();
    },
    onScan: () => {
      if (!warehouseId || itemOpen || scanBusy || success) return;
      setScanOpen(true);
    },
    onAddItem: () => {
      if (!warehouseId || success) return;
      setItemOpen(true);
    },
  });

  if (success) {
    return (
      <PrintDocument>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {success.outNumber}
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Inventory out posted · {success.status}
            </p>
          </div>
          <div className="no-print flex gap-2">
            <PrintButton />
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
      </PrintDocument>
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

      <FormEnterNav className={FORM_GRID}>
        <div className="space-y-1.5">
          <Label htmlFor="warehouse">Warehouse</Label>
          <select
            ref={warehouseRef}
            id="warehouse"
            className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
            {...formSelectPickerProps()}
            value={warehouseId}
            onChange={(e) => {
              setWarehouseId(e.target.value);
              setLines([]);
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
            {...formDatePickerProps()}
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
      </FormEnterNav>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-medium">Bill</h2>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!warehouseId || itemOpen || scanBusy || Boolean(success)}
              onClick={() => setScanOpen(true)}
            >
              Scan barcode
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!warehouseId}
              onClick={() => setItemOpen(true)}
            >
              Add SKU
            </Button>
          </div>
        </div>

        <FormEnterNav className="border-border overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Barcode</th>
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">SKU</th>
                <th className="px-4 py-3 font-medium">Available</th>
                <th className="px-4 py-3 font-medium">Unit price</th>
                <th className="px-4 py-3 font-medium">Sell as</th>
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
                  <td className="px-4 py-3 tabular-nums">{unitPrice(line)}</td>
                  <td className="px-4 py-3">
                    {line.unitsPerPurchaseUnit > 1 ? (
                      <select
                        className="border-input bg-background h-8 rounded-md border px-2 text-sm"
                        {...formSelectPickerProps()}
                        value={line.sellUnit}
                        onChange={(e) => {
                          const sellUnit = e.target.value as SellUnit;
                          setLines((prev) =>
                            prev.map((l) =>
                              l.productSkuId === line.productSkuId
                                ? { ...l, sellUnit, lastScanMultiplier: undefined }
                                : l,
                            ),
                          );
                        }}
                      >
                        <option value="pc">{line.baseUnitName ?? "pc"}</option>
                        <option value="box">
                          {line.purchaseUnitName ?? "box"}
                        </option>
                      </select>
                    ) : (
                      <span className="text-muted-foreground">
                        {line.baseUnitName ?? "pc"}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <Input
                      className="h-8 w-24"
                      data-sku-qty={line.productSkuId}
                      value={String(
                        line.sellUnit === "box" && line.unitsPerPurchaseUnit > 1
                          ? round4(line.quantity / line.unitsPerPurchaseUnit)
                          : line.quantity,
                      )}
                      aria-invalid={
                        line.quantity <= 0 ||
                        line.quantity > line.quantityAvailable
                      }
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        const baseQty =
                          line.sellUnit === "box" && line.unitsPerPurchaseUnit > 1
                            ? round4(n * line.unitsPerPurchaseUnit)
                            : Number.isNaN(n)
                              ? 0
                              : n;
                        setLines((prev) =>
                          prev.map((l) =>
                            l.productSkuId === line.productSkuId
                              ? {
                                  ...l,
                                  quantity: baseQty,
                                  lastScanMultiplier: undefined,
                                }
                              : l,
                          ),
                        );
                      }}
                    />
                    {quantityHint(line) ? (
                      <p className="text-muted-foreground mt-1 text-xs">
                        {quantityHint(line)}
                      </p>
                    ) : null}
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
                      onClick={() => {
                        if (!confirmRemoveTableLine(line.sku)) return;
                        setLines((prev) =>
                          prev.filter(
                            (l) => l.productSkuId !== line.productSkuId,
                          ),
                        );
                      }}
                    >
                      Remove
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </FormEnterNav>

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

      <KeyboardHints
        hints={[
          KEYBOARD_HINT_ENTER,
          KEYBOARD_HINT_SCAN,
          KEYBOARD_HINT_ADD,
          KEYBOARD_HINT_SAVE,
        ]}
      />

      <AddInventoryOutItemDialog
        open={itemOpen}
        warehouseId={warehouseId}
        existingSkuIds={existingSkuIds}
        onClose={() => setItemOpen(false)}
        onAddMany={(added) => {
          const merged = [...lines, ...added];
          setLines(merged);
          setItemOpen(false);
          if (merged[0]) {
            focusLineQty(merged[0].productSkuId);
          }
        }}
      />

      <ScanBarcodePanel
        open={scanOpen}
        onOpenChange={setScanOpen}
        busy={scanBusy}
        clearAfterComplete
        description="Scan or type a barcode, then press Enter to add or increment qty by 1."
        onComplete={(code) => onBarcodeEnter(code)}
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
