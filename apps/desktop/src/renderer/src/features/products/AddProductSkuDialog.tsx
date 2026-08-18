import { useEffect, useState } from "react";
import type {
  CreateProductSkuRequest,
  EntityStatus,
  ProductSkuDetail,
  UnitListItem,
} from "@blackbox/shared";
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
import { unitsApi } from "@renderer/lib/api/units";

const emptyForm = {
  variantName: "",
  sku: "",
  barcode: "",
  sizeValue: "",
  sizeUnit: "",
  baseUnitId: "",
  purchaseUnitId: "",
  unitsPerPurchaseUnit: "1",
  costPrice: "0",
  sellingPrice: "0",
  reorderLevel: "0",
  minimumStockLevel: "0",
  maximumStockLevel: "",
  trackInventory: true,
  status: "active" as EntityStatus,
};

export function AddProductSkuDialog({
  open,
  productId,
  onClose,
  onCreated,
}: {
  open: boolean;
  productId: string;
  onClose: () => void;
  onCreated: (row: ProductSkuDetail, cacheWarning: boolean) => void;
}) {
  const [units, setUnits] = useState<UnitListItem[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    void unitsApi.list().then(setUnits).catch(() => undefined);
  }, [open]);

  function reset() {
    setForm(emptyForm);
    setError(null);
  }

  function setField<K extends keyof typeof emptyForm>(
    key: K,
    value: (typeof emptyForm)[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function onSave() {
    if (!form.variantName.trim()) {
      setError("Variant name is required");
      return;
    }
    if (!form.sku.trim()) {
      setError("SKU code is required");
      return;
    }
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
      baseUnitId: form.baseUnitId || null,
      purchaseUnitId: form.purchaseUnitId || null,
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
    let row: ProductSkuDetail;
    try {
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
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label>SKU *</Label>
            <Input
              value={form.sku}
              onChange={(e) => setField("sku", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Barcode</Label>
            <Input
              value={form.barcode}
              onChange={(e) => setField("barcode", e.target.value)}
              placeholder="Scan or type barcode"
            />
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
            <Label>Base unit</Label>
            <select
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              value={form.baseUnitId}
              onChange={(e) => setField("baseUnitId", e.target.value)}
            >
              <option value="">—</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.abbreviation})
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Purchase unit</Label>
            <select
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              value={form.purchaseUnitId}
              onChange={(e) => setField("purchaseUnitId", e.target.value)}
            >
              <option value="">—</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.abbreviation})
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Units / purchase unit</Label>
            <Input
              value={form.unitsPerPurchaseUnit}
              onChange={(e) => setField("unitsPerPurchaseUnit", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Cost price</Label>
            <Input
              value={form.costPrice}
              onChange={(e) => setField("costPrice", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Selling price</Label>
            <Input
              value={form.sellingPrice}
              onChange={(e) => setField("sellingPrice", e.target.value)}
            />
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
          <Button type="button" disabled={saving} onClick={() => void onSave()}>
            {saving ? "Saving…" : "Add SKU"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
