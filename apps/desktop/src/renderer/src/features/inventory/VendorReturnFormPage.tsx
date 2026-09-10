import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type {
  SellUnit,
  VendorReturnDetail,
  VendorReturnReason,
  VendorListItem,
  VendorSku,
  WarehouseListItem,
} from "@blackbox/shared";
import { VENDOR_RETURN_REASONS, VENDOR_RETURN_REASON_LABELS } from "@blackbox/shared";
import { FORM_GRID } from "@renderer/lib/form-layout";
import {
  FormEnterNav,
  formDatePickerProps,
  formSelectPickerProps,
} from "@renderer/components/form-enter-nav";
import { Button } from "@blackbox/ui/button";
import { Input } from "@blackbox/ui/input";
import { Label } from "@blackbox/ui/label";
import { getApiErrorMessage } from "@renderer/lib/api/client";
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
import { vendorReturnsApi } from "@renderer/lib/api/vendor-returns";
import { syncNow } from "@renderer/lib/sync/sync-status";
import { commitLocalChange, isDeviceBound } from "@renderer/lib/local-db/local-write";
import {
  loadLastPurchaseCost,
  loadSkuProfile,
  loadSkuByBarcode,
  loadVendors,
  loadWarehouses,
  resolveVendorReturnScan,
  type VendorReturnScanCandidate,
} from "@renderer/lib/local-db/entity-source";
import {
  AddVendorReturnItemDialog,
  toDraftReturnLine,
  type DraftReturnLine,
} from "./AddVendorReturnItemDialog";
import { PickReturnVendorDialog } from "./PickReturnVendorDialog";
import {
  defaultSellUnitForScan,
  formatReturnableAvailable,
  returnLineTotalFromPcs,
} from "./vendor-return-line";

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
  const [lines, setLines] = useState<DraftReturnLine[]>([]);
  const [itemOpen, setItemOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanBusy, setScanBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<VendorReturnDetail | null>(null);
  const [vendorPickOpen, setVendorPickOpen] = useState(false);
  const [vendorPickCandidates, setVendorPickCandidates] = useState<
    VendorReturnScanCandidate[]
  >([]);
  const [vendorPickProductName, setVendorPickProductName] = useState("");
  const [vendorPickSku, setVendorPickSku] = useState("");
  const [vendorPickWarehouseQty, setVendorPickWarehouseQty] = useState<
    number | null
  >(null);
  const vendorRef = useRef<HTMLSelectElement>(null);

  async function appendLineFromScan(
    resolvedVendorId: string,
    match: VendorSku,
    scannedQuantityMultiplier: number,
  ) {
    if (lines.some((l) => l.productSkuId === match.productSkuId)) {
      setError("Already added — update its quantity");
      return false;
    }
    const available = match.quantityAvailable ?? 0;
    if (available <= 0) {
      setError(`No stock available for ${match.sku}`);
      return false;
    }
    const unitsPer =
      match.unitsPerPurchaseUnit > 0 ? match.unitsPerPurchaseUnit : 1;
    const quantityPcs = scannedQuantityMultiplier;
    if (quantityPcs > available) {
      setError(
        `Cannot exceed returnable (${available} pcs) for ${match.sku}`,
      );
      return false;
    }
    let unitCost = match.purchasePrice;
    try {
      unitCost = await loadLastPurchaseCost(resolvedVendorId, match.productSkuId);
    } catch {
      /* fallback to purchasePrice */
    }
    const profile = await loadSkuProfile(match.productSkuId);
    const sellUnit = defaultSellUnitForScan(
      scannedQuantityMultiplier,
      unitsPer,
    );
    setLines((prev) => [
      ...prev,
      {
        ...toDraftReturnLine(match, unitCost, {
          baseUnitName: profile.sku.baseUnitName ?? null,
          sellUnit,
          quantityPcs,
          lastScanMultiplier: scannedQuantityMultiplier,
        }),
        lineTotal: returnLineTotalFromPcs(quantityPcs, unitsPer, unitCost),
      },
    ]);
    return true;
  }

  function updateLine(
    productSkuId: string,
    patch: Partial<Pick<DraftReturnLine, "quantity" | "reason" | "sellUnit">>,
  ) {
    setLines((prev) =>
      prev.map((l) => {
        if (l.productSkuId !== productSkuId) return l;
        const next = { ...l, ...patch };
        if ("quantity" in patch || "sellUnit" in patch) {
          next.lastScanMultiplier = undefined;
          next.lineTotal = returnLineTotalFromPcs(
            next.quantity,
            next.unitsPerPurchaseUnit,
            next.unitCost,
          );
        }
        return next;
      }),
    );
  }

  async function addSkuFromBarcode(code: string) {
    const trimmed = code.trim();
    if (!trimmed || scanBusy) return;
    if (!warehouseId) {
      setError("Select warehouse first");
      return;
    }

    setScanBusy(true);
    setError(null);
    try {
      const result = await resolveVendorReturnScan(
        trimmed,
        warehouseId,
        vendorId || undefined,
      );
      if (result.kind === "need_warehouse") {
        setError("Select warehouse first");
        return;
      }
      if (result.kind === "not_found") {
        setError("No SKU found for this barcode");
        return;
      }
      if (result.kind === "not_linked") {
        setError("This SKU is not linked to the selected vendor");
        return;
      }
      if (result.kind === "no_stock") {
        setError(`No stock available for ${result.sku}`);
        return;
      }
      if (result.kind === "pick_vendor") {
        setVendorPickCandidates(result.candidates);
        setVendorPickProductName(result.productName);
        setVendorPickSku(result.sku);
        setVendorPickWarehouseQty(null);
        void loadSkuByBarcode(trimmed, warehouseId)
          .then((row) => setVendorPickWarehouseQty(row.quantityAvailable ?? 0))
          .catch(() => undefined);
        setVendorPickOpen(true);
        return;
      }

      if (!vendorId) {
        setVendorId(result.vendorId);
      }
      await appendLineFromScan(
        result.vendorId,
        result.row,
        result.scannedQuantityMultiplier,
      );
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Barcode lookup failed"));
    } finally {
      setScanBusy(false);
    }
  }

  async function onPickReturnVendor(pickedVendorId: string) {
    const candidate = vendorPickCandidates.find(
      (c) => c.vendorId === pickedVendorId,
    );
    if (!candidate) {
      setVendorPickOpen(false);
      setVendorPickCandidates([]);
      return;
    }

    setVendorPickOpen(false);
    setVendorPickCandidates([]);
    setVendorId(pickedVendorId);
    setError(null);
    await appendLineFromScan(
      pickedVendorId,
      candidate.row,
      candidate.scannedQuantityMultiplier,
    );
  }

  useEffect(() => {
    void loadVendors({ status: "active", pageSize: 100 })
      .then((r) => {
        setVendors(r.items);
        requestAnimationFrame(() => vendorRef.current?.focus());
      })
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

  const lineQtyIssues = useMemo(
    () =>
      lines.flatMap((line) => {
        if (!(line.quantity > 0)) {
          return [`Enter a quantity greater than 0 for ${line.sku}`];
        }
        if (line.quantity > line.quantityAvailable) {
          return [
            `${line.sku}: quantity exceeds returnable stock (${line.quantityAvailable.toLocaleString()} pcs)`,
          ];
        }
        return [];
      }),
    [lines],
  );

  const canPost =
    lines.length > 0 &&
    lineQtyIssues.length === 0;

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
      if (!(line.quantity > 0)) {
        setError(`Enter a quantity greater than 0 for ${line.sku}`);
        return;
      }
      if (line.quantity > line.quantityAvailable) {
        setError(
          `Invalid quantity for ${line.sku}: exceeds returnable stock (${line.quantityAvailable} pcs)`,
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
          notes: "",
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
          const stockDelta = round4(item.quantity);
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
        notes: "",
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

  usePageKeyboard({
    enabled: !success,
    onSave: () => {
      if (!saving) void onConfirm();
    },
    onScan: () => {
      if (!warehouseId || itemOpen || scanBusy || success || vendorPickOpen) return;
      setScanOpen(true);
    },
    onAddItem: () => {
      if (!vendorId || !warehouseId || success) return;
      setItemOpen(true);
    },
  });

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
          Mark SKUs returned to a vendor. Select a warehouse, then scan a SKU —
          the vendor is chosen automatically when possible. Quantities are in
          pieces; stock is removed immediately at purchase unit cost.
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
          <Label>Vendor</Label>
          <select
            ref={vendorRef}
            className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm disabled:opacity-60"
            {...formSelectPickerProps()}
            value={vendorId}
            disabled={lines.length > 0}
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
            {...formSelectPickerProps()}
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
            {...formDatePickerProps()}
            value={returnDate}
            onChange={(e) => setReturnDate(e.target.value)}
          />
        </div>
      </FormEnterNav>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-medium">Items</h2>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={
                !warehouseId || itemOpen || scanBusy || Boolean(success) || vendorPickOpen
              }
              onClick={() => setScanOpen(true)}
            >
              Scan barcode
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!vendorId || !warehouseId}
              onClick={() => setItemOpen(true)}
            >
              Add items
            </Button>
          </div>
        </div>
        <FormEnterNav className="border-border overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Product</th>
                <th className="px-3 py-2 font-medium">SKU</th>
                <th className="px-3 py-2 font-medium">Reason</th>
                <th className="px-3 py-2 font-medium">Unit</th>
                <th className="px-3 py-2 font-medium">Returnable</th>
                <th className="px-3 py-2 font-medium">Qty</th>
                <th className="px-3 py-2 font-medium">Unit cost</th>
                <th className="px-3 py-2 font-medium">Total</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="text-muted-foreground px-3 py-4 text-sm"
                  >
                    {warehouseId
                      ? "No items yet. Scan a barcode or add items manually."
                      : "Select a warehouse, then scan a SKU or add items."}
                  </td>
                </tr>
              ) : null}
              {lines.map((line) => {
                const returnable = formatReturnableAvailable(line);
                return (
                <tr key={line.productSkuId} className="border-border border-t">
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
                      {...formSelectPickerProps()}
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
                    {line.unitsPerPurchaseUnit > 1 ? (
                      <select
                        className="border-input bg-background h-8 rounded-md border px-2 text-sm"
                        {...formSelectPickerProps()}
                        value={line.sellUnit}
                        onChange={(e) => {
                          updateLine(line.productSkuId, {
                            sellUnit: e.target.value as SellUnit,
                          });
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
                  <td className="px-3 py-2 align-top">
                    <span className="tabular-nums">{returnable.primary}</span>
                    {returnable.secondary ? (
                      <div className="text-muted-foreground mt-0.5 text-xs">
                        {returnable.secondary}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
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
                        const quantityPcs =
                          line.sellUnit === "box" && line.unitsPerPurchaseUnit > 1
                            ? round4(n * line.unitsPerPurchaseUnit)
                            : Number.isNaN(n)
                              ? line.quantity
                              : n;
                        updateLine(line.productSkuId, { quantity: quantityPcs });
                      }}
                    />
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
              );
              })}
            </tbody>
          </table>
        </FormEnterNav>

        {lineQtyIssues.length > 0 ? (
          <div
            role="alert"
            className="border-destructive/40 bg-destructive/5 text-destructive rounded-lg border px-4 py-3 text-sm"
          >
            <p className="font-medium">Fix quantities before posting:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {lineQtyIssues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="grid max-w-sm gap-2 text-sm sm:ml-auto">
        <div className="flex justify-between gap-6 border-t pt-2 font-medium">
          <span>Total</span>
          <span className="tabular-nums">{subtotal.toLocaleString()}</span>
        </div>
      </section>

      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          disabled={saving || !canPost}
          onClick={() => void onConfirm()}
        >
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

      <KeyboardHints
        hints={[
          KEYBOARD_HINT_ENTER,
          KEYBOARD_HINT_SCAN,
          KEYBOARD_HINT_ADD,
          KEYBOARD_HINT_SAVE,
        ]}
      />

      {itemOpen ? (
        <AddVendorReturnItemDialog
          open
          vendorId={vendorId}
          warehouseId={warehouseId}
          existingSkuIds={lines.map((l) => l.productSkuId)}
          onClose={() => setItemOpen(false)}
          onAddMany={(newLines) => {
            const merged = [...lines, ...newLines];
            setLines(merged);
            setItemOpen(false);
            if (merged[0]) {
              focusLineQty(merged[0].productSkuId);
            }
          }}
        />
      ) : null}

      <ScanBarcodePanel
        open={scanOpen}
        onOpenChange={setScanOpen}
        busy={scanBusy}
        clearAfterComplete
        onComplete={(code) => addSkuFromBarcode(code)}
      />

      {vendorPickOpen ? (
        <PickReturnVendorDialog
          open
          productName={vendorPickProductName}
          sku={vendorPickSku}
          candidates={vendorPickCandidates}
          warehouseStockAvailable={vendorPickWarehouseQty}
          onPick={(id) => void onPickReturnVendor(id)}
          onClose={() => {
            setVendorPickOpen(false);
            setVendorPickCandidates([]);
            setVendorPickWarehouseQty(null);
          }}
        />
      ) : null}
    </div>
  );
}
