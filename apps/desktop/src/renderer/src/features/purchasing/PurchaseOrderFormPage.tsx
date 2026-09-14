import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type {
  CreatePurchaseOrderRequest,
  OrderUnit,
  VendorListItem,
  WarehouseListItem,
} from "@blackbox/shared";
import {
  defaultOrderUnitForScan,
  displayPurchaseUnitCost,
  lineTotalForPurchase,
  toDisplayQuantity,
  toPurchaseQuantity,
} from "@blackbox/shared";
import { FORM_GRID } from "@renderer/lib/form-layout";
import { Button } from "@blackbox/ui/button";
import { Input } from "@blackbox/ui/input";
import { Label } from "@blackbox/ui/label";
import { handleEnterPickerFocus } from "@blackbox/ui/lib/form-keyboard";
import { ConfirmDialog } from "@renderer/components/confirm-dialog";
import { useConfirm } from "@renderer/components/confirm-provider";
import { PrintButton } from "@renderer/components/print-button";
import { PrintDocument } from "@renderer/components/print-document";
import { ScanBarcodePanel } from "@renderer/components/scan-barcode-panel";
import { FormEnterNav, formSelectPickerProps } from "@renderer/components/form-enter-nav";
import {
  KEYBOARD_HINT_ADD,
  KEYBOARD_HINT_ENTER,
  KEYBOARD_HINT_SAVE,
  KEYBOARD_HINT_SCAN,
  KeyboardHints,
} from "@renderer/components/keyboard-hints";
import { removeTableLineConfirmOptions } from "@renderer/lib/confirm-remove-line";
import { focusLineQty } from "@renderer/lib/focus-line-qty";
import { usePageKeyboard } from "@renderer/lib/use-page-keyboard";
import { getApiErrorMessage } from "@renderer/lib/api/client";
import { purchaseOrdersApi } from "@renderer/lib/api/purchase-orders";
import { syncNow } from "@renderer/lib/sync/sync-status";
import { commitLocalChange, isDeviceBound } from "@renderer/lib/local-db/local-write";
import { loadPurchaseOrder, loadVendors, loadVendorSkus, loadWarehouses, findVendorSkuByBarcode } from "@renderer/lib/local-db/entity-source";
import { allocatePoNumber } from "@renderer/lib/document-numbers";
import { useSession } from "@renderer/lib/session/context";
import {
  AddPurchaseOrderItemDialog,
  recomputePoLine,
  toDraftPoLine,
  type DraftPoLine,
} from "./AddPurchaseOrderItemDialog";
import { PendingVendorReturnsSection } from "./PendingVendorReturnsSection";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export function PurchaseOrderFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const confirm = useConfirm();

  const [vendors, setVendors] = useState<VendorListItem[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseListItem[]>([]);
  const [poNumber, setPoNumber] = useState("Assigned on save");
  const { user } = useSession();
  const [status, setStatus] = useState("DRAFT");
  const [vendorId, setVendorId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [orderDate, setOrderDate] = useState(todayIso());
  const [expectedDate, setExpectedDate] = useState("");
  const [lines, setLines] = useState<DraftPoLine[]>([]);
  const orderDateRef = useRef<HTMLInputElement>(null);
  const [itemOpen, setItemOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanBusy, setScanBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(isEdit);

  function focusQty(productSkuId: string) {
    focusLineQty(productSkuId);
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
      const result = await findVendorSkuByBarcode(
        vendorId,
        trimmed,
        warehouseId,
      );
      if (result.kind === "not_found") {
        setError("No SKU found for this barcode");
        return;
      }
      if (result.kind === "not_linked") {
        setError("This SKU is not linked to the selected vendor");
        return;
      }
      const match = result.row;
      if (lines.some((l) => l.productSkuId === match.productSkuId)) {
        setError("Already added — update its quantity");
        return;
      }
      const orderUnit = defaultOrderUnitForScan(
        result.scannedQuantityMultiplier,
        match.unitsPerPurchaseUnit,
      );
      const displayQty =
        orderUnit === "box" && match.unitsPerPurchaseUnit > 1
          ? round4(
              result.scannedQuantityMultiplier / match.unitsPerPurchaseUnit,
            )
          : result.scannedQuantityMultiplier;
      setLines((prev) => [
        ...prev,
        recomputePoLine(toDraftPoLine(match), {
          orderUnit,
          quantity: displayQty,
        }),
      ]);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Barcode lookup failed"));
    } finally {
      setScanBusy(false);
    }
  }

  useEffect(() => {
    void loadVendors({ status: "active", pageSize: 100 })
      .then((r) => {
        setVendors(r.items);
        if (!isEdit && r.items.length > 0) {
          setVendorId((current) => current || r.items[0]!.id);
        }
      })
      .catch(() => undefined);
    void loadWarehouses()
      .then((rows) => {
        setWarehouses(rows);
        if (!isEdit && rows.length > 0) {
          setWarehouseId((current) => current || rows[0]!.id);
        }
      })
      .catch(() => undefined);
  }, [isEdit]);

  useEffect(() => {
    if (loading || isEdit) return;
    requestAnimationFrame(() => orderDateRef.current?.focus());
  }, [loading, isEdit]);

  useEffect(() => {
    if (isEdit) return;
    const tenantName = user?.tenantName?.trim() ?? "";
    if (!tenantName) return;
    void allocatePoNumber(tenantName).then(setPoNumber);
  }, [isEdit, user?.tenantName]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    void loadPurchaseOrder(id)
      .then(async (po) => {
        if (cancelled) return;
        if (po.status !== "DRAFT") {
          setError("Only DRAFT purchase orders can be edited");
          return;
        }
        const availabilityBySku = new Map<string, number>();
        try {
          const currentVendorSkus = await loadVendorSkus(
            po.vendorId,
            "",
            po.warehouseId,
          );
          for (const row of currentVendorSkus) {
            availabilityBySku.set(row.productSkuId, row.quantityAvailable ?? 0);
          }
        } catch {
          /* availability is informational */
        }
        if (cancelled) return;
        setPoNumber(po.poNumber);
        setStatus(po.status);
        setVendorId(po.vendorId);
        setWarehouseId(po.warehouseId);
        setOrderDate(po.orderDate);
        setExpectedDate(po.expectedDate ?? "");
        setLines(
          po.items.map((i) => {
            const orderUnit = (i.orderUnit ?? "box") as OrderUnit;
            return recomputePoLine({
              productSkuId: i.productSkuId,
              vendorSkuId: i.vendorSkuId,
              productName: i.productName,
              variantName: i.variantName,
              sku: i.sku,
              purchaseUnitId: i.purchaseUnitId,
              purchaseUnitName: i.purchaseUnitName,
              baseUnitName: i.baseUnitName ?? null,
              unitsPerPurchaseUnit: i.unitsPerPurchaseUnit,
              orderUnit,
              purchasePrice: i.unitCost,
              quantityAvailable: availabilityBySku.get(i.productSkuId) ?? 0,
              quantity: toDisplayQuantity(
                i.quantity,
                orderUnit,
                i.unitsPerPurchaseUnit,
              ),
              unitCost: displayPurchaseUnitCost(
                i.unitCost,
                orderUnit,
                i.unitsPerPurchaseUnit,
              ),
              minimumOrderQuantity: i.minimumOrderQuantity,
              lineTotal: i.lineTotal,
            });
          }),
        );
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(getApiErrorMessage(err, "Failed to load purchase order"));
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
      Math.round(lines.reduce((sum, l) => sum + l.lineTotal, 0) * 10000) /
      10000,
    [lines],
  );

  function buildBody(submit?: boolean): CreatePurchaseOrderRequest | null {
    if (!vendorId) {
      setError("Vendor is required");
      return null;
    }
    if (!warehouseId) {
      setError("Warehouse is required");
      return null;
    }
    if (submit && lines.length === 0) {
      setError("Add at least one item before submitting");
      return null;
    }
    for (const line of lines) {
      if (!(line.quantity > 0)) {
        setError(`Enter a quantity greater than zero for ${line.sku}`);
        return null;
      }
      const purchaseQty = toPurchaseQuantity(
        line.quantity,
        line.orderUnit,
        line.unitsPerPurchaseUnit,
      );
      if (submit && purchaseQty < line.minimumOrderQuantity) {
        setError(
          `Minimum order quantity for ${line.sku} is ${line.minimumOrderQuantity} ${line.purchaseUnitName ?? "units"}.`,
        );
        return null;
      }
    }
    return {
      vendorId,
      warehouseId,
      orderDate,
      expectedDate: expectedDate || null,
      notes: "",
      discount: 0,
      tax: 0,
      otherCharges: 0,
      items: lines.map((l) => {
        const pricing = lineTotalForPurchase({
          displayQuantity: l.quantity,
          purchasePrice: l.purchasePrice,
          unitsPerPurchaseUnit: l.unitsPerPurchaseUnit,
          orderUnit: l.orderUnit,
        });
        return {
          productSkuId: l.productSkuId,
          vendorSkuId: l.vendorSkuId,
          quantity: pricing.purchaseQuantity,
          unitCost: l.purchasePrice,
          orderUnit: l.orderUnit,
        };
      }),
      submit: submit || undefined,
    };
  }

  async function persist(submit: boolean) {
    const body = buildBody(submit);
    if (!body) return;

    setSaving(true);
    setError(null);
    let saved;
    try {
      if (await isDeviceBound()) {
        const localId = isEdit && id ? id : crypto.randomUUID();
        const now = new Date().toISOString();
        const assignedPoNumber = isEdit
          ? poNumber
          : await allocatePoNumber(user?.tenantName ?? "");
        saved = {
          id: localId,
          poNumber: assignedPoNumber,
          vendorId: body.vendorId,
          vendorName: vendors.find((v) => v.id === body.vendorId)?.name ?? "",
          warehouseId: body.warehouseId,
          warehouseName:
            warehouses.find((w) => w.id === body.warehouseId)?.name ?? "",
          status: submit ? "SUBMITTED" : "DRAFT",
          orderDate: body.orderDate ?? todayIso(),
          expectedDate: body.expectedDate ?? null,
          subtotal,
          discount: 0,
          tax: 0,
          otherCharges: 0,
          total: subtotal,
          notes: "",
          items: lines.map((l) => {
            const pricing = lineTotalForPurchase({
              displayQuantity: l.quantity,
              purchasePrice: l.purchasePrice,
              unitsPerPurchaseUnit: l.unitsPerPurchaseUnit,
              orderUnit: l.orderUnit,
            });
            return {
              id: crypto.randomUUID(),
              productSkuId: l.productSkuId,
              vendorSkuId: l.vendorSkuId,
              productName: l.productName,
              variantName: l.variantName,
              sku: l.sku,
              vendorSkuCode: null,
              purchaseUnitId: l.purchaseUnitId,
              purchaseUnitName: l.purchaseUnitName,
              baseUnitName: l.baseUnitName,
              unitsPerPurchaseUnit: l.unitsPerPurchaseUnit,
              orderUnit: l.orderUnit,
              quantity: pricing.purchaseQuantity,
              unitCost: l.purchasePrice,
              discount: 0,
              tax: 0,
              lineTotal: pricing.lineTotal,
              minimumOrderQuantity: l.minimumOrderQuantity,
            };
          }),
          createdAt: now,
          updatedAt: now,
        };
        await commitLocalChange({
          entityType: "purchase_order",
          entityId: localId,
          operation: "UPSERT",
          payload: saved as unknown as Record<string, unknown>,
        });
        void syncNow();
        setSaving(false);
        navigate(`/purchase-orders/${localId}`, {
          state: { po: saved },
          replace: true,
        });
        return;
      }
      saved = isEdit
        ? await purchaseOrdersApi.update(id!, body)
        : await purchaseOrdersApi.create(body);
    } catch (err: unknown) {
      setSaving(false);
      setError(getApiErrorMessage(err, "Failed to save purchase order"));
      return;
    }

    try {
      await window.blackbox?.localDb?.upsertPurchaseOrder(saved);
    } catch {
      /* optional cache */
    }
    setSaving(false);
    navigate(`/purchase-orders/${saved.id}`, {
      state: { po: saved },
      replace: true,
    });
  }

  usePageKeyboard({
    onSave: () => {
      if (saving) return;
      if (!buildBody(true)) return;
      setSubmitConfirmOpen(true);
    },
    onScan: () => {
      if (!vendorId || !warehouseId || itemOpen || scanBusy) return;
      setScanOpen(true);
    },
    onAddItem: () => {
      if (!vendorId || !warehouseId) return;
      setItemOpen(true);
    },
  });

  if (loading) {
    return <p className="text-muted-foreground text-sm">Loading…</p>;
  }

  const vendorName = vendors.find((v) => v.id === vendorId)?.name;

  return (
    <div className="space-y-6">
      {error ? (
        <div
          role="alert"
          className="border-destructive/40 bg-destructive/5 text-destructive no-print rounded-lg border px-4 py-3 text-sm"
        >
          {error}
        </div>
      ) : null}

      <PrintDocument>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {isEdit ? poNumber : "Purchase Order"}
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {status.replaceAll("_", " ")} · {orderDate}
            </p>
          </div>
          <div className="no-print">
            <PrintButton />
          </div>
        </div>

        <p className="text-muted-foreground no-print text-sm">
          {isEdit ? "Edit purchase order" : "Create purchase order"} — select
          vendor and warehouse, then add SKUs supplied by that vendor.
        </p>

      <section className={FORM_GRID}>
        <div className="space-y-1.5">
          <Label htmlFor="po-order-date">Order date</Label>
          <Input
            ref={orderDateRef}
            id="po-order-date"
            type="date"
            data-enter-picker=""
            value={orderDate}
            min={isEdit ? undefined : todayIso()}
            onFocus={handleEnterPickerFocus}
            onChange={(e) => setOrderDate(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="po-expected-date">Expected delivery</Label>
          <Input
            id="po-expected-date"
            type="date"
            data-enter-picker=""
            value={expectedDate}
            min={orderDate || (!isEdit ? todayIso() : undefined)}
            onFocus={handleEnterPickerFocus}
            onChange={(e) => setExpectedDate(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="po-vendor">Vendor *</Label>
          <select
            id="po-vendor"
            data-enter-picker=""
            className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
            value={vendorId}
            onFocus={handleEnterPickerFocus}
            onChange={(e) => {
              setVendorId(e.target.value);
              setLines([]);
            }}
          >
            <option value="">Select vendor…</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="po-warehouse">Receive into warehouse *</Label>
          <select
            id="po-warehouse"
            data-enter-picker=""
            className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
            value={warehouseId}
            onFocus={handleEnterPickerFocus}
            onChange={(e) => {
              setWarehouseId(e.target.value);
              setLines([]);
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
          <Label>PO Number</Label>
          <Input value={poNumber} disabled />
        </div>
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Input value={status} disabled />
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-medium">Order items</h2>
          <div className="no-print flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!vendorId || !warehouseId || itemOpen || scanBusy}
              onClick={() => setScanOpen(true)}
            >
              Scan barcode
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!vendorId || !warehouseId}
              onClick={() => setItemOpen(true)}
            >
              + Add Item
            </Button>
          </div>
        </div>
        {!vendorId || !warehouseId ? (
          <p className="text-muted-foreground no-print text-sm">
            {!vendorId
              ? "Select a vendor before adding items."
              : "Select a warehouse before adding items."}
          </p>
        ) : null}
        <FormEnterNav className="border-border overflow-hidden rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Product</th>
                <th className="px-3 py-2 font-medium">SKU</th>
                <th className="px-3 py-2 font-medium">Unit</th>
                <th className="px-3 py-2 font-medium">Cost</th>
                <th className="px-3 py-2 font-medium">Available</th>
                <th className="px-3 py-2 font-medium">Qty</th>
                <th className="px-3 py-2 font-medium">Total</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? (
                <tr className="border-border border-t">
                  <td
                    colSpan={8}
                    className="text-muted-foreground px-3 py-6 text-center"
                  >
                    No items yet.
                  </td>
                </tr>
              ) : null}
              {lines.map((line) => (
                <tr key={line.productSkuId} className="border-border border-t">
                  <td className="px-3 py-2">
                    {line.productName}
                    <div className="text-muted-foreground text-xs">
                      {line.variantName || "—"}
                    </div>
                  </td>
                  <td className="px-3 py-2">{line.sku}</td>
                  <td className="px-3 py-2">
                    {line.unitsPerPurchaseUnit > 1 ? (
                      <select
                        className="border-input bg-background h-8 rounded-md border px-2 text-sm"
                        {...formSelectPickerProps()}
                        value={line.orderUnit}
                        onChange={(e) => {
                          const orderUnit = e.target.value as OrderUnit;
                          setLines((prev) =>
                            prev.map((l) =>
                              l.productSkuId === line.productSkuId
                                ? recomputePoLine(l, { orderUnit })
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
                  <td className="px-3 py-2">
                    <Input
                      className="h-8 w-24"
                      value={String(line.unitCost)}
                      disabled
                      readOnly
                    />
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {line.quantityAvailable.toLocaleString()} base
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      className="h-8 w-20"
                      data-sku-qty={line.productSkuId}
                      value={String(line.quantity)}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => {
                        const quantity = Number(e.target.value);
                        setLines((prev) =>
                          prev.map((l) =>
                            l.productSkuId === line.productSkuId
                              ? recomputePoLine(l, {
                                  quantity: Number.isNaN(quantity)
                                    ? l.quantity
                                    : quantity,
                                })
                              : l,
                          ),
                        );
                      }}
                    />
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {line.lineTotal.toLocaleString()}
                  </td>
                  <td className="no-print px-3 py-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="no-print"
                      onClick={() => {
                        void (async () => {
                          const ok = await confirm(
                            removeTableLineConfirmOptions(line.sku),
                          );
                          if (!ok) return;
                          setLines((prev) =>
                            prev.filter(
                              (l) => l.productSkuId !== line.productSkuId,
                            ),
                          );
                        })();
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
      </section>

      {vendorId ? (
        <PendingVendorReturnsSection
          vendorId={vendorId}
          vendorName={vendorName}
        />
      ) : null}

      <section className="grid max-w-sm gap-2 text-sm sm:ml-auto">
        <div className="flex justify-between gap-6 border-t pt-2 font-medium">
          <span>Total</span>
          <span className="tabular-nums">{subtotal.toLocaleString()}</span>
        </div>
      </section>
      </PrintDocument>

      <div className="no-print flex flex-wrap gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={saving}
          onClick={() => void persist(false)}
        >
          {saving ? "Saving…" : "Save Draft"}
        </Button>
        <Button
          type="button"
          disabled={saving}
          onClick={() => {
            if (!buildBody(true)) return;
            setSubmitConfirmOpen(true);
          }}
        >
          Submit PO
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() =>
            navigate(isEdit ? `/purchase-orders/${id}` : "/purchase-orders")
          }
        >
          Cancel
        </Button>
      </div>

      <div className="no-print">
        <KeyboardHints
          hints={[
            KEYBOARD_HINT_ENTER,
            KEYBOARD_HINT_SCAN,
            KEYBOARD_HINT_ADD,
            KEYBOARD_HINT_SAVE,
          ]}
        />
      </div>

      <AddPurchaseOrderItemDialog
        open={itemOpen}
        vendorId={vendorId}
        warehouseId={warehouseId}
        existingSkuIds={lines.map((l) => l.productSkuId)}
        onClose={() => setItemOpen(false)}
        onAddMany={(newLines) => {
          setLines((prev) => [
            ...prev,
            ...newLines.filter(
              (l) => !prev.some((p) => p.productSkuId === l.productSkuId),
            ),
          ]);
          setItemOpen(false);
          const first = newLines[0];
          if (first) focusQty(first.productSkuId);
        }}
      />

      <ScanBarcodePanel
        open={scanOpen}
        onOpenChange={setScanOpen}
        busy={scanBusy}
        clearAfterComplete
        onComplete={(code) => addSkuFromBarcode(code)}
      />

      <ConfirmDialog
        open={submitConfirmOpen}
        onOpenChange={setSubmitConfirmOpen}
        title="Submit this Purchase Order?"
        description={
          <>
            <p>
              Vendor:{" "}
              {vendors.find((v) => v.id === vendorId)?.name ?? "Vendor"}
            </p>
            <p>Total: {subtotal.toLocaleString()}</p>
            <p>Items: {lines.length}</p>
          </>
        }
        confirmLabel="Submit PO"
        loading={saving}
        onConfirm={async () => {
          await persist(true);
          setSubmitConfirmOpen(false);
        }}
      />
    </div>
  );
}
