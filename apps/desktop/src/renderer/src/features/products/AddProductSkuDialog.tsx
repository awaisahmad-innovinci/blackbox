import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CreateProductSkuRequest,
  EntityStatus,
  ProductSkuDetail,
  SkuBarcodeLookupResult,
  UnitListItem,
  VendorDetail,
  VendorSku,
} from "@blackbox/shared";
import { normalizeStoredText } from "@blackbox/shared";
import { FORM_DIALOG_FIELD_FULL, FORM_DIALOG_GRID } from "@renderer/lib/form-layout";
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
import { BarcodeAssignRow, type BarcodeAssignRowHandle } from "@renderer/components/scan-barcode-panel";
import {
  FormEnterNav,
  formSelectPickerProps,
} from "@renderer/components/form-enter-nav";
import {
  KEYBOARD_HINT_ENTER,
  KEYBOARD_HINT_SAVE,
  KEYBOARD_HINT_SCAN,
  KeyboardHints,
} from "@renderer/components/keyboard-hints";
import { usePageKeyboard } from "@renderer/lib/use-page-keyboard";
import { productsApi } from "@renderer/lib/api/products";
import { allocateSkuCode } from "@renderer/lib/document-numbers";
import { loadUnits, lookupSkuByBarcode, lookupSkuByCode } from "@renderer/lib/local-db/entity-source";
import { commitLocalChange, isDeviceBound } from "@renderer/lib/local-db/local-write";
import { syncNow } from "@renderer/lib/sync/sync-status";
import {
  optionalNonNegativeMargin,
  sellingFromMargin,
  sellingGreaterThanCost,
} from "@renderer/lib/sku-pricing";
import { createVendorSkuLink } from "@renderer/features/vendors/create-vendor-sku-link";

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
  marginPercent: "",
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
  linkToVendor,
  onClose,
  onCreated,
  onVendorSkuLinked,
}: {
  open: boolean;
  productId: string;
  productName: string;
  /** When set, auto-links the new SKU to this vendor after creation. */
  linkToVendor?: VendorDetail;
  onClose: () => void;
  onCreated: (row: ProductSkuDetail, cacheWarning: boolean) => void;
  onVendorSkuLinked?: (row: VendorSku, cacheWarning: boolean) => void;
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
  const barcodeRowRef = useRef<BarcodeAssignRowHandle>(null);

  useEffect(() => {
    if (!open) return;
    setForm(emptyForm);
    setError(null);
    setDuplicateLookup(null);
    setDuplicateMessage(null);
    setAttempted(false);
    void allocateSkuCode(productName).then((code) => {
      setForm((prev) => ({ ...prev, sku: code }));
    });
    void loadUnits().then(setUnits).catch(() => undefined);
  }, [open, productName]);

  async function applyBarcode(code: string) {
    const trimmed = code.trim();
    if (!trimmed) {
      setForm((prev) => ({ ...prev, barcode: "" }));
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
    }
  }

  function reset() {
    setForm(emptyForm);
    setError(null);
    setDuplicateLookup(null);
    setDuplicateMessage(null);
    setAttempted(false);
    void allocateSkuCode(productName).then((code) => {
      setForm((prev) => ({ ...prev, sku: code }));
    });
  }

  function setField<K extends keyof typeof emptyForm>(
    key: K,
    value: (typeof emptyForm)[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function onCostPriceChange(value: string) {
    setForm((prev) => {
      const next = { ...prev, costPrice: value };
      const calculated = sellingFromMargin(value, prev.marginPercent);
      if (calculated != null) next.sellingPrice = calculated;
      return next;
    });
  }

  function onMarginPercentChange(value: string) {
    setForm((prev) => {
      const next = { ...prev, marginPercent: value };
      const calculated = sellingFromMargin(prev.costPrice, value);
      if (calculated != null) next.sellingPrice = calculated;
      return next;
    });
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
          ? requiredNonNegative(form.costPrice, "Cost price/pc")
          : null,
      marginPercent: optionalNonNegativeMargin(form.marginPercent),
      sellingPrice:
        form.sellingPrice.trim() || attempted
          ? requiredNonNegative(form.sellingPrice, "Selling price/pc") ||
            sellingGreaterThanCost(form.costPrice, form.sellingPrice)
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
    !requiredNonNegative(form.costPrice, "Cost price/pc") &&
    !optionalNonNegativeMargin(form.marginPercent) &&
    !requiredNonNegative(form.sellingPrice, "Selling price/pc") &&
    !sellingGreaterThanCost(form.costPrice, form.sellingPrice) &&
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
    if (nums.sellingPrice <= nums.costPrice) {
      setError("Selling price/pc must be greater than cost price/pc");
      return;
    }

    const body: CreateProductSkuRequest = {
      variantName: normalizeStoredText(form.variantName),
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
    let skuCacheWarning = false;
    try {
      if (await isDeviceBound()) {
        let skuCode = form.sku.trim();
        const skuDup = await lookupSkuByCode(skuCode);
        if (skuDup) {
          skuCode = await allocateSkuCode(productName);
          const stillDup = await lookupSkuByCode(skuCode);
          if (stillDup) {
            setSaving(false);
            setError(
              `SKU code ${skuCode} already exists on ${stillDup.productName}.`,
            );
            return;
          }
          body.sku = skuCode;
          setForm((prev) => ({ ...prev, sku: skuCode }));
        }

        const localId = crypto.randomUUID();
        const baseUnit = units.find((u) => u.id === body.baseUnitId);
        const purchaseUnit = units.find((u) => u.id === body.purchaseUnitId);
        row = {
          id: localId,
          productId,
          variantName: body.variantName,
          sku: skuCode,
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
          sellingPricePerPurchaseUnit: body.sellingPricePerPurchaseUnit ?? null,
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
        if (body.barcode) {
          const barcodeId = crypto.randomUUID();
          await commitLocalChange({
            entityType: "product_sku_barcode",
            entityId: barcodeId,
            operation: "UPSERT",
            payload: {
              id: barcodeId,
              productSkuId: localId,
              barcode: body.barcode,
              status: "active",
              quantityMultiplier: 1,
            },
          });
          row = { ...row, barcode: body.barcode };
        }
        void syncNow();
        setSaving(false);
        if (linkToVendor && onVendorSkuLinked) {
          try {
            const { row: vendorSku, cacheWarning: linkCacheWarning } =
              await createVendorSkuLink({
                vendorId: linkToVendor.id,
                productName,
                sku: row,
              });
            reset();
            onCreated(row, false);
            onVendorSkuLinked(vendorSku, linkCacheWarning);
            return;
          } catch (err: unknown) {
            reset();
            onCreated(row, false);
            setError(
              getApiErrorMessage(
                err,
                "SKU created but failed to link vendor. Link it from the vendor profile.",
              ),
            );
            return;
          }
        }
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
    skuCacheWarning = cacheWarning;
    setSaving(false);

    if (linkToVendor && onVendorSkuLinked) {
      try {
        const { row: vendorSku, cacheWarning: linkCacheWarning } =
          await createVendorSkuLink({
            vendorId: linkToVendor.id,
            productName,
            sku: row,
          });
        reset();
        onCreated(row, skuCacheWarning);
        onVendorSkuLinked(vendorSku, linkCacheWarning);
        return;
      } catch (err: unknown) {
        reset();
        onCreated(row, skuCacheWarning);
        setError(
          getApiErrorMessage(
            err,
            "SKU created but failed to link vendor. Link it from the vendor profile.",
          ),
        );
        return;
      }
    }

    reset();
    onCreated(row, cacheWarning);
  }

  usePageKeyboard({
    enabled: open,
    onSave: () => {
      if (!saving && canSave) void onSave();
    },
    onScan: () => barcodeRowRef.current?.openScan(),
  });

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
      <DialogContent className="fixed top-1/2 left-1/2 max-h-[85vh] w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto lg:max-w-4xl">
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

        <FormEnterNav className={FORM_DIALOG_GRID}>
          <div className={`space-y-1.5 ${FORM_DIALOG_FIELD_FULL}`}>
            <Label>Variant *</Label>
            <Input
              value={form.variantName}
              onChange={(e) => setField("variantName", e.target.value)}
              onBlur={(e) =>
                setField("variantName", normalizeStoredText(e.target.value))
              }
              aria-invalid={Boolean(fieldErrors.variantName)}
              autoFocus
            />
            {fieldErrors.variantName ? (
              <p className="text-destructive text-xs">{fieldErrors.variantName}</p>
            ) : null}
          </div>
          <div className={`${FORM_DIALOG_FIELD_FULL}`}>
            <BarcodeAssignRow
              ref={barcodeRowRef}
              value={form.barcode}
              checking={barcodeChecking}
              layer="dialog"
              buttonLabel="short"
              returnFocusTo="sku-size-value"
              onApply={async (code) => {
                if (duplicateLookup) {
                  setDuplicateLookup(null);
                  setDuplicateMessage(null);
                }
                await applyBarcode(code);
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label>SKU</Label>
            <Input value={form.sku} readOnly disabled />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sku-size-value">Size value</Label>
            <Input
              id="sku-size-value"
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
              {...formSelectPickerProps()}
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
              {...formSelectPickerProps()}
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
            <Label>Cost price/pc *</Label>
            <Input
              value={form.costPrice}
              aria-invalid={Boolean(fieldErrors.costPrice)}
              onChange={(e) => onCostPriceChange(e.target.value)}
            />
            {fieldErrors.costPrice ? (
              <p className="text-destructive text-xs">{fieldErrors.costPrice}</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label>Margin %</Label>
            <Input
              value={form.marginPercent}
              aria-invalid={Boolean(fieldErrors.marginPercent)}
              placeholder="Optional — auto-fills selling price"
              onChange={(e) => onMarginPercentChange(e.target.value)}
            />
            {fieldErrors.marginPercent ? (
              <p className="text-destructive text-xs">{fieldErrors.marginPercent}</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label>Selling price/pc *</Label>
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
              {...formSelectPickerProps()}
              value={form.status}
              onChange={(e) =>
                setField("status", e.target.value as EntityStatus)
              }
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <label className={`flex items-center gap-2 text-sm ${FORM_DIALOG_FIELD_FULL}`}>
            <input
              type="checkbox"
              checked={form.trackInventory}
              onChange={(e) => setField("trackInventory", e.target.checked)}
            />
            Track inventory
          </label>
        </FormEnterNav>

        <KeyboardHints
          hints={[KEYBOARD_HINT_ENTER, KEYBOARD_HINT_SCAN, KEYBOARD_HINT_SAVE]}
        />

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
