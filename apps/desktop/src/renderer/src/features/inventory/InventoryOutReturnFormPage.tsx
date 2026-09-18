import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type {
  InventoryOutDetail,
  InventoryOutReturnDetail,
  SkuSearchResult,
  WarehouseListItem,
} from "@blackbox/shared";
import { FORM_GRID } from "@renderer/lib/form-layout";
import { Button } from "@blackbox/ui/button";
import { Input } from "@blackbox/ui/input";
import { Label } from "@blackbox/ui/label";
import { ScanBarcodePanel } from "@renderer/components/scan-barcode-panel";
import {
  KEYBOARD_HINT_ADD,
  KEYBOARD_HINT_SCAN,
  KeyboardHints,
} from "@renderer/components/keyboard-hints";
import { usePageKeyboard } from "@renderer/lib/use-page-keyboard";
import { getApiErrorMessage } from "@renderer/lib/api/client";
import { inventoryOutReturnsApi } from "@renderer/lib/api/inventory-out-returns";
import { syncNow } from "@renderer/lib/sync/sync-status";
import { commitLocalChange, isDeviceBound } from "@renderer/lib/local-db/local-write";
import {
  loadInventoryOutReturnableQuantity,
  loadSkuByBarcode,
  loadWarehouses,
} from "@renderer/lib/local-db/entity-source";
import { allocateOutReturnNumber } from "@renderer/lib/document-numbers";
import { focusLineQty } from "@renderer/lib/focus-line-qty";
import { useSession } from "@renderer/lib/session/context";
import {
  AddInventoryOutReturnItemDialog,
  type DraftOutReturnLine,
} from "./AddInventoryOutReturnItemDialog";
import { draftLinesFromInventoryOut } from "./out-return-prefill";

type DraftLine = DraftOutReturnLine;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export function InventoryOutReturnFormPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const fromOut = (location.state as { fromOut?: InventoryOutDetail } | null)
    ?.fromOut;
  const { user } = useSession();
  const [warehouses, setWarehouses] = useState<WarehouseListItem[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [returnDate, setReturnDate] = useState(todayIso());
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [itemOpen, setItemOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanBusy, setScanBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<InventoryOutReturnDetail | null>(null);
  const [prefillApplied, setPrefillApplied] = useState(false);

  useEffect(() => {
    void loadWarehouses("active")
      .then((rows) => {
        setWarehouses(rows);
        if (!fromOut && rows.length === 1) setWarehouseId(rows[0]!.id);
      })
      .catch(() => undefined);
  }, [fromOut]);

  useEffect(() => {
    if (!fromOut || prefillApplied) return;
    setPrefillApplied(true);
    setWarehouseId(fromOut.warehouseId);
    void draftLinesFromInventoryOut(fromOut).then((draftLines) => {
      if (draftLines.length === 0) {
        setError("No POS balance left to return for this out bill");
        return;
      }
      setLines(draftLines);
      setError(null);
      focusLineQty(draftLines[0]!.productSkuId);
    });
  }, [fromOut, prefillApplied]);

  async function addSku(sku: SkuSearchResult) {
    if (!warehouseId) {
      setError("Select a warehouse first");
      return;
    }
    const { quantityAvailable } = await loadInventoryOutReturnableQuantity(
      warehouseId,
      sku.id,
    );
    if (!(quantityAvailable > 0)) {
      setError(`No out balance for ${sku.sku}`);
      return;
    }
    let added = false;
    setLines((prev) => {
      if (prev.some((l) => l.productSkuId === sku.id)) {
        setError("SKU already on this return");
        return prev;
      }
      setError(null);
      added = true;
      return [
        ...prev,
        {
          productSkuId: sku.id,
          productName: sku.productName,
          variantName: sku.variantName,
          sku: sku.sku,
          quantity: Math.min(1, quantityAvailable),
          quantityAvailable,
          unitCost: sku.costPrice ?? 0,
        },
      ];
    });
    if (added) focusLineQty(sku.id);
  }

  function addManyLines(newLines: DraftLine[]) {
    if (newLines.length === 0) return;
    const existingIds = new Set(lines.map((l) => l.productSkuId));
    const toAdd = newLines.filter((line) => !existingIds.has(line.productSkuId));
    if (toAdd.length === 0) return;
    setLines((prev) => [...prev, ...toAdd]);
    setError(null);
    focusLineQty(toAdd[toAdd.length - 1]!.productSkuId);
  }

  async function onScan(barcode: string) {
    if (!warehouseId) {
      setError("Select a warehouse first");
      return;
    }
    setScanBusy(true);
    setError(null);
    try {
      const sku = await loadSkuByBarcode(barcode, warehouseId);
      await addSku(sku);
      setScanOpen(false);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "SKU not found"));
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
          `Invalid quantity for ${line.sku}: max ${line.quantityAvailable}`,
        );
        return;
      }
    }

    setSaving(true);
    try {
      const warehouseName =
        warehouses.find((w) => w.id === warehouseId)?.name ??
        fromOut?.warehouseName ??
        "";
      if (await isDeviceBound()) {
        const localId = crypto.randomUUID();
        const now = new Date().toISOString();
        const returnNumber = await allocateOutReturnNumber(user?.tenantName ?? "");
        const items = lines.map((l) => ({
          id: crypto.randomUUID(),
          productSkuId: l.productSkuId,
          productName: l.productName,
          variantName: l.variantName,
          sku: l.sku,
          barcode: null,
          quantity: l.quantity,
          unitCost: l.unitCost,
          lineTotal: round4(l.quantity * l.unitCost),
          inventoryOutItemId: null,
        }));
        const subtotal = items.reduce((s, i) => s + i.lineTotal, 0);
        const detail: InventoryOutReturnDetail = {
          id: localId,
          returnNumber,
          warehouseId,
          warehouseName,
          returnDate,
          notes: "",
          status: "POSTED",
          subtotal,
          total: subtotal,
          items,
          createdAt: now,
          updatedAt: now,
        };
        await commitLocalChange({
          entityType: "inventory_out_return",
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
              movementType: "INVENTORY_OUT_RETURN",
              quantity: item.quantity,
              delta: item.quantity,
              referenceType: "inventory_out_return",
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

      const detail = await inventoryOutReturnsApi.create({
        warehouseId,
        returnDate,
        items: lines.map((l) => ({
          productSkuId: l.productSkuId,
          quantity: l.quantity,
        })),
      });
      try {
        await window.blackbox?.localDb?.upsertInventoryOutReturn?.(detail);
        for (const item of detail.items) {
          await window.blackbox?.localDb?.applyInventoryOutBalanceDelta?.(
            detail.warehouseId,
            item.productSkuId,
            -item.quantity,
            item.unitCost,
          );
        }
      } catch {
        /* optional cache */
      }
      setSuccess(detail);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Failed to post return"));
    } finally {
      setSaving(false);
    }
  }

  usePageKeyboard({
    enabled: !success,
    onSave: () => {
      if (!saving && lines.length > 0) void onConfirm();
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
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">
          {success.returnNumber}
        </h1>
        <p className="text-muted-foreground text-sm">
          Return posted · {success.status}
        </p>
        <div className="flex gap-2">
          <Button onClick={() => navigate(`/inventory/out-returns/${success.id}`)}>
            View
          </Button>
          <Button variant="ghost" onClick={() => navigate("/inventory/out-returns")}>
            Back to list
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          New inventory out return
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {fromOut
            ? `Returning from ${fromOut.outNumber}`
            : "Move stock from POS balance back to warehouse"}
        </p>
      </div>

      <div className={FORM_GRID}>
        <div className="space-y-2">
          <Label htmlFor="warehouse">Warehouse</Label>
          <select
            id="warehouse"
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm disabled:opacity-60"
            value={warehouseId}
            disabled={Boolean(fromOut)}
            onChange={(e) => {
              setWarehouseId(e.target.value);
              setLines([]);
            }}
          >
            <option value="">Select warehouse</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="returnDate">Return date</Label>
          <Input
            id="returnDate"
            type="date"
            value={returnDate}
            onChange={(e) => setReturnDate(e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={!warehouseId || itemOpen || scanBusy}
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
          Add item
        </Button>
      </div>

      <KeyboardHints hints={[KEYBOARD_HINT_SCAN, KEYBOARD_HINT_ADD]} />

      {error ? (
        <div
          role="alert"
          className="border-destructive/40 bg-destructive/5 text-destructive rounded-lg border px-4 py-3 text-sm"
        >
          {error}
        </div>
      ) : null}

      <div className="rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left">
              <th className="px-4 py-2">SKU</th>
              <th className="px-4 py-2 text-right">Out balance</th>
              <th className="px-4 py-2 text-right">Return qty</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-muted-foreground px-4 py-6">
                  Scan or add SKUs with POS out balance
                </td>
              </tr>
            ) : (
              lines.map((line) => (
                <tr key={line.productSkuId} className="border-b">
                  <td className="px-4 py-2">
                    <div className="font-medium">{line.sku}</div>
                    <div className="text-muted-foreground text-xs">
                      {line.productName} {line.variantName}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right">{line.quantityAvailable}</td>
                  <td className="px-4 py-2 text-right">
                    <Input
                      className="ml-auto h-8 w-24 text-right"
                      data-sku-qty={line.productSkuId}
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
                                  quantity: Number.isNaN(n) ? l.quantity : n,
                                }
                              : l,
                          ),
                        );
                      }}
                    />
                  </td>
                  <td className="px-4 py-2 text-right">
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
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          disabled={saving || lines.length === 0}
          onClick={() => void onConfirm()}
        >
          {saving ? "Posting…" : "Post return"}
        </Button>
      </div>

      <AddInventoryOutReturnItemDialog
        open={itemOpen}
        warehouseId={warehouseId}
        existingSkuIds={lines.map((l) => l.productSkuId)}
        onClose={() => setItemOpen(false)}
        onAddMany={(added) => {
          addManyLines(added);
          setItemOpen(false);
        }}
      />

      <ScanBarcodePanel
        open={scanOpen}
        busy={scanBusy}
        onOpenChange={setScanOpen}
        clearAfterComplete
        onComplete={(code) => void onScan(code)}
      />
    </div>
  );
}
