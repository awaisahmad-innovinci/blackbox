import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CreateProductSkuRequest,
  EntityStatus,
  ProductSkuDetail,
  SkuBarcodeLookupResult,
  UnitListItem,
} from "@blackbox/shared";
import { nextSkuCodeForProduct } from "@blackbox/shared";
import { Button } from "@blackbox/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@blackbox/ui/dialog";
import { Input } from "@blackbox/ui/input";
import { Label } from "@blackbox/ui/label";
import { getApiErrorMessage } from "@renderer/lib/api/client";
import { productsApi } from "@renderer/lib/api/products";
import { loadUnits, lookupSkuByBarcode } from "@renderer/lib/local-db/entity-source";
import { commitLocalChange, isDeviceBound } from "@renderer/lib/local-db/local-write";
import { useBarcodeScanTarget } from "@renderer/lib/barcode-scan";
import { syncNow } from "@renderer/lib/sync/sync-status";

const emptyForm = {
  variantName: "",
  sku: "",
  barcode: "",
  sizeValue: "",
  sizeUnit: "",
  baseUnitId: "",
  purchaseUnitId: "",
  unitsPerPurchaseUnit: "",
  costPrice: "",
  sellingPrice: "",
  reorderLevel: "0",
  minimumStockLevel: "0",
  maximumStockLevel: "",
  trackInventory: true,
  status: "active" as EntityStatus,
};

function requiredSelect(value: string, label: string): string | null {
  return value ? null : `${label} is required`;
}

function requiredPositive(value: string, label: string): string | null {
  if (!value.trim()) return `${label} is required`;
  const n = Number(value);
  if (Number.isNaN(n) || n <= 0) return `${label} must be greater than zero`;
  return null;
}

function requiredNonNegative(value: string, label: string): string | null {
  if (!value.trim()) return `${label} is required`;
  const n = Number(value);
  if (Number.isNaN(n) || n < 0) return `${label} must be a non-negative number`;
  return null;
}

function duplicateBarcodeMessage(row: SkuBarcodeLookupResult): string {
  const base = `This barcode already exists on ${row.productName} (${row.sku})`;
  const skuInactive = row.status === "inactive";
  const productInactive = row.productStatus === "inactive";
  if (skuInactive && productInactive) {
    return `${base}, but the SKU and product are inactive.`;
  }
  if (skuInactive) {
    return `${base}, but the SKU is inactive.`;
  }
  if (productInactive) {
    return `${base}, but the product is inactive.`;
  }
  return `${base}.`;
}

export function AddProductSkuDialog({
  open,
  productId,
  productName,
  existingSkuCodes,
  onClose,
  onCreated,
}: {
  open: boolean;
  productId: string;
  productName: string;
  existingSkuCodes: string[];
  onClose: () => void;
  onCreated: (row: ProductSkuDetail, cacheWarning: boolean) => void;
}) {
  const [units, setUnits] = useState<UnitListItem[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [duplicateLookup, setDuplicateLookup] =
    useState<SkuBarcodeLookupResult | null>(null);
  const [duplicateMessage, setDuplicateMessage] = useState<string | null>(
    null,
  );
  const [barcodeChecking, setBarcodeChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const barcodeRef = useRef<HTMLInputElement>(null);
  const barcodeValueRef = useRef("");

  useEffect(() => {
    barcodeValueRef.current = form.barcode;
  }, [form.barcode]);

  useEffect(() => {
    if (!open) return;
    setForm({
      ...emptyForm,
      sku: nextSkuCodeForProduct(productName, existingSkuCodes),
    });
    setError(null);
    setDuplicateLookup(null);
    setDuplicateMessage(null);
    setAttempted(false);
    void loadUnits().then(setUnits).catch(() => undefined);
  }, [open, productName, existingSkuCodes]);

  async function applyBarcode(
    code: string,
    options: { focusAfter?: boolean } = {},
  ) {
    const trimmed = code.trim();
    if (!trimmed) {
      setDuplicateLookup(null);
      setDuplicateMessage(null);
      return;
    }

    setBarcodeChecking(true);
    setError(null);
    try {
      const match = await lookupSkuByBarcode(trimmed);
      setForm((prev) => ({ ...prev, barcode: trimmed }));
      if (match) {
        setDuplicateLookup(match);
        setDuplicateMessage(duplicateBarcodeMessage(match));
      } else {
        setDuplicateLookup(null);
        setDuplicateMessage(null);
      }
    } catch (err: unknown) {
      setDuplicateLookup(null);
      setDuplicateMessage(null);
      setError(getApiErrorMessage(err, "Barcode lookup failed"));
    } finally {
      setBarcodeChecking(false);
      if (options.focusAfter) {
        requestAnimationFrame(() => {
          barcodeRef.current?.focus();
          barcodeRef.current?.select();
        });
      }
    }
  }

  useBarcodeScanTarget({
    kind: "barcode",
    layer: "dialog",
    enabled: open,
    onScan: (code) => {
      const trimmed = code.trim();
      barcodeValueRef.current = trimmed;
      setForm((prev) => ({ ...prev, barcode: trimmed }));
      if (duplicateLookup) {
        setDuplicateLookup(null);
        setDuplicateMessage(null);
      }
      void applyBarcode(trimmed, { focusAfter: true });
    },
  });

  function reset() {
    setForm({
      ...emptyForm,
      sku: nextSkuCodeForProduct(productName, existingSkuCodes),
    });
    setError(null);
    setDuplicateLookup(null);
    setDuplicateMessage(null);
    setAttempted(false);
  }

  function setField<K extends keyof typeof emptyForm>(
    key: K,
    value: (typeof emptyForm)[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const fieldErrors = useMemo(
    () => ({
      variantName: form.variantName.trim()
        ? null
        : attempted
          ? "Variant is required"
          : null,
      baseUnitId: attempted
        ? requiredSelect(form.baseUnitId, "Base unit")
        : null,
      purchaseUnitId: attempted
        ? requiredSelect(form.purchaseUnitId, "Purchase unit")
        : null,
      unitsPerPurchaseUnit:
        form.unitsPerPurchaseUnit.trim() || attempted
          ? requiredPositive(form.unitsPerPurchaseUnit, "Units / purchase unit")
          : null,
      costPrice:
        form.costPrice.trim() || attempted
          ? requiredNonNegative(form.costPrice, "Cost price")
          : null,
      sellingPrice:
        form.sellingPrice.trim() || attempted
          ? requiredNonNegative(form.sellingPrice, "Selling price")
          : null,
    }),
    [form, attempted],
  );

  const canSave =
    Boolean(form.variantName.trim()) &&
    Boolean(form.sku.trim()) &&
    !requiredSelect(form.baseUnitId, "Base unit") &&
    !requiredSelect(form.purchaseUnitId, "Purchase unit") &&
    !requiredPositive(form.unitsPerPurchaseUnit, "Units / purchase unit") &&
    !requiredNonNegative(form.costPrice, "Cost price") &&
    !requiredNonNegative(form.sellingPrice, "Selling price") &&
    !duplicateLookup &&
    !barcodeChecking;

  async function onSave() {
    setAttempted(true);
    if (!canSave) return;

    const nums = {
      unitsPerPurchaseUnit: Number(form.unitsPerPurchaseUnit),
      costPrice: Number(form.costPrice),
      sellingPrice: Number(form.sellingPrice),
      reorderLevel: Number(form.reorderLevel),
      minimumStockLevel: Number(form.minimumStockLevel),
      maximumStockLevel:
        form.maximumStockLevel.trim() === ""
          ? null
          : Number(form.maximumStockLevel),
    };
    for (const [key, val] of Object.entries(nums)) {
      if (key === "maximumStockLevel" && val === null) continue;
      if (typeof val !== "number" || Number.isNaN(val) || val < 0) {
        setError(`${key} must be a non-negative number`);
        return;
      }
    }

    const body: CreateProductSkuRequest = {
      variantName: form.variantName.trim(),
      sku: form.sku.trim(),
      barcode: form.barcode.trim() || null,
      sizeValue: form.sizeValue.trim() || null,
      sizeUnit: form.sizeUnit.trim() || null,
      baseUnitId: form.baseUnitId,
      purchaseUnitId: form.purchaseUnitId,
      unitsPerPurchaseUnit: nums.unitsPerPurchaseUnit,
      costPrice: nums.costPrice,
      sellingPrice: nums.sellingPrice,
      reorderLevel: nums.reorderLevel,
      minimumStockLevel: nums.minimumStockLevel,
      maximumStockLevel: nums.maximumStockLevel,
      trackInventory: form.trackInventory,
      status: form.status,
    };

    setSaving(true);
    setError(null);
    if (body.barcode) {
      try {
        const dup = await lookupSkuByBarcode(body.barcode);
        if (dup) {
          setDuplicateLookup(dup);
          setDuplicateMessage(duplicateBarcodeMessage(dup));
          setSaving(false);
          return;
        }
      } catch (err: unknown) {
        setSaving(false);
        setError(getApiErrorMessage(err, "Barcode lookup failed"));
        return;
      }
    }
    let row: ProductSkuDetail;
    try {
      if (await isDeviceBound()) {
        const localId = crypto.randomUUID();
        const baseUnit = units.find((u) => u.id === body.baseUnitId);
        const purchaseUnit = units.find((u) => u.id === body.purchaseUnitId);
        row = {
          id: localId,
          productId,
          variantName: body.variantName,
          sku: body.sku ?? "",
          barcode: body.barcode ?? null,
          sizeValue: body.sizeValue ?? null,
          sizeUnit: body.sizeUnit ?? null,
          baseUnitId: body.baseUnitId,
          baseUnitName: baseUnit?.name ?? null,
          purchaseUnitId: body.purchaseUnitId,
          purchaseUnitName: purchaseUnit?.name ?? null,
          unitsPerPurchaseUnit: body.unitsPerPurchaseUnit,
          costPrice: body.costPrice,
          sellingPrice: body.sellingPrice,
          reorderLevel: body.reorderLevel ?? 0,
          minimumStockLevel: body.minimumStockLevel ?? 0,
          maximumStockLevel: body.maximumStockLevel ?? null,
          trackInventory: body.trackInventory ?? true,
          status: body.status ?? "active",
        };
        await commitLocalChange({
          entityType: "product_sku",
          entityId: localId,
          operation: "UPSERT",
          payload: row as unknown as Record<string, unknown>,
        });
        void syncNow();
        setSaving(false);
        reset();
        onCreated(row, false);
        return;
      }
      row = await productsApi.createSku(productId, body);
    } catch (err: unknown) {
      setSaving(false);
      setError(getApiErrorMessage(err, "Failed to add SKU"));
      return;
    }

    let cacheWarning = false;
    try {
      await window.blackbox?.localDb?.upsertProductSku(row);
    } catch {
      cacheWarning = true;
    }
    setSaving(false);
    reset();
    onCreated(row, cacheWarning);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !saving) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className="fixed top-1/2 left-1/2 max-h-[85vh] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add SKU</DialogTitle>
        </DialogHeader>

        {duplicateMessage ? (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm text-amber-950 dark:text-amber-200">
            {duplicateMessage}
          </div>
        ) : null}

        {error ? (
          <div className="border-destructive/40 bg-destructive/5 text-destructive rounded-md border px-3 py-2 text-sm">
            {error}
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Variant *</Label>
            <Input
              value={form.variantName}
              onChange={(e) => setField("variantName", e.target.value)}
              aria-invalid={Boolean(fieldErrors.variantName)}
              autoFocus
            />
            {fieldErrors.variantName ? (
              <p className="text-destructive text-xs">{fieldErrors.variantName}</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label>SKU</Label>
            <Input value={form.sku} readOnly disabled />
          </div>
          <div className="space-y-1.5">
            <Label>Barcode</Label>
            <Input
              ref={barcodeRef}
              value={form.barcode}
              onChange={(e) => {
                setField("barcode", e.target.value);
                barcodeValueRef.current = e.target.value;
                if (duplicateLookup) {
                  setDuplicateLookup(null);
                  setDuplicateMessage(null);
                }
              }}
              onBlur={() => void applyBarcode(barcodeValueRef.current)}
              placeholder="Scan or type barcode"
              data-enter-submit=""
              autoComplete="off"
            />
            {barcodeChecking ? (
              <p className="text-muted-foreground text-xs">Checking barcode…</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label>Size value</Label>
            <Input
              value={form.sizeValue}
              onChange={(e) => setField("sizeValue", e.target.value)}
              placeholder="1"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Size unit</Label>
            <Input
              value={form.sizeUnit}
              onChange={(e) => setField("sizeUnit", e.target.value)}
              placeholder="L"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Base unit *</Label>
            <select
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              value={form.baseUnitId}
              aria-invalid={Boolean(fieldErrors.baseUnitId)}
              onChange={(e) => setField("baseUnitId", e.target.value)}
            >
              <option value="">—</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.abbreviation})
                </option>
              ))}
            </select>
            {fieldErrors.baseUnitId ? (
              <p className="text-destructive text-xs">{fieldErrors.baseUnitId}</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label>Purchase unit *</Label>
            <select
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              value={form.purchaseUnitId}
              aria-invalid={Boolean(fieldErrors.purchaseUnitId)}
              onChange={(e) => setField("purchaseUnitId", e.target.value)}
            >
              <option value="">—</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.abbreviation})
                </option>
              ))}
            </select>
            {fieldErrors.purchaseUnitId ? (
              <p className="text-destructive text-xs">
                {fieldErrors.purchaseUnitId}
              </p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label>Units / purchase unit *</Label>
            <Input
              value={form.unitsPerPurchaseUnit}
              aria-invalid={Boolean(fieldErrors.unitsPerPurchaseUnit)}
              onChange={(e) => setField("unitsPerPurchaseUnit", e.target.value)}
            />
            {fieldErrors.unitsPerPurchaseUnit ? (
              <p className="text-destructive text-xs">
                {fieldErrors.unitsPerPurchaseUnit}
              </p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label>Cost price *</Label>
            <Input
              value={form.costPrice}
              aria-invalid={Boolean(fieldErrors.costPrice)}
              onChange={(e) => setField("costPrice", e.target.value)}
            />
            {fieldErrors.costPrice ? (
              <p className="text-destructive text-xs">{fieldErrors.costPrice}</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label>Selling price *</Label>
            <Input
              value={form.sellingPrice}
              aria-invalid={Boolean(fieldErrors.sellingPrice)}
              onChange={(e) => setField("sellingPrice", e.target.value)}
            />
            {fieldErrors.sellingPrice ? (
              <p className="text-destructive text-xs">
                {fieldErrors.sellingPrice}
              </p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label>Reorder level</Label>
            <Input
              value={form.reorderLevel}
              onChange={(e) => setField("reorderLevel", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Minimum stock</Label>
            <Input
              value={form.minimumStockLevel}
              onChange={(e) => setField("minimumStockLevel", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Maximum stock</Label>
            <Input
              value={form.maximumStockLevel}
              onChange={(e) => setField("maximumStockLevel", e.target.value)}
              placeholder="optional"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <select
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              value={form.status}
              onChange={(e) =>
                setField("status", e.target.value as EntityStatus)
              }
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={form.trackInventory}
              onChange={(e) => setField("trackInventory", e.target.checked)}
            />
            Track inventory
          </label>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={saving || !canSave}
            onClick={() => void onSave()}
          >
            {saving ? "Saving…" : "Add SKU"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
