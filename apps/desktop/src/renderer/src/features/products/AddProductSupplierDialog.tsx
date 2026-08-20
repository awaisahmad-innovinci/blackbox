import { useEffect, useState } from "react";
import type {
  ProductSkuDetail,
  UnitListItem,
  VendorListItem,
  VendorSku,
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
import { Textarea } from "@blackbox/ui/textarea";
import { getApiErrorMessage } from "@renderer/lib/api/client";
import { unitsApi } from "@renderer/lib/api/units";
import { vendorSkusApi } from "@renderer/lib/api/vendor-skus";
import { loadVendors } from "@renderer/lib/local-db/entity-source";

function packagingFromSku(sku: ProductSkuDetail | undefined) {
  return {
    purchaseUnitId: sku?.purchaseUnitId ?? "",
    unitsPerPurchaseUnit:
      sku?.unitsPerPurchaseUnit != null
        ? String(sku.unitsPerPurchaseUnit)
        : "1",
  };
}

export function AddProductSupplierDialog({
  open,
  skus,
  lockedSkuId,
  onClose,
  onCreated,
}: {
  open: boolean;
  skus: ProductSkuDetail[];
  /** When set, SKU is fixed (required first supplier after Add SKU). */
  lockedSkuId?: string | null;
  onClose: () => void;
  onCreated: (row: VendorSku, cacheWarning: boolean) => void;
}) {
  const [productSkuId, setProductSkuId] = useState("");
  const [vendorQuery, setVendorQuery] = useState("");
  const [vendors, setVendors] = useState<VendorListItem[]>([]);
  const [selectedVendor, setSelectedVendor] = useState<VendorListItem | null>(
    null,
  );
  const [units, setUnits] = useState<UnitListItem[]>([]);
  const [purchasePrice, setPurchasePrice] = useState("");
  const [purchaseUnitId, setPurchaseUnitId] = useState("");
  const [unitsPerPurchaseUnit, setUnitsPerPurchaseUnit] = useState("1");
  const [moq, setMoq] = useState("1");
  const [leadTimeDays, setLeadTimeDays] = useState("0");
  const [isPreferred, setIsPreferred] = useState(false);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    void unitsApi.list().then(setUnits).catch(() => undefined);
    if (lockedSkuId) {
      setProductSkuId(lockedSkuId);
    } else if (skus.length === 1) {
      setProductSkuId(skus[0]!.id);
    }
  }, [open, skus, lockedSkuId]);

  useEffect(() => {
    if (!open || !productSkuId) return;
    const sku = skus.find((s) => s.id === productSkuId);
    const packaging = packagingFromSku(sku);
    setPurchaseUnitId(packaging.purchaseUnitId);
    setUnitsPerPurchaseUnit(packaging.unitsPerPurchaseUnit);
  }, [open, productSkuId, skus]);

  useEffect(() => {
    if (!open || selectedVendor) return;
    const t = setTimeout(() => {
      void loadVendors({
        search: vendorQuery.trim() || undefined,
        status: "active",
      })
        .then((res) => setVendors(res.items))
        .catch(() => setVendors([]));
    }, 200);
    return () => clearTimeout(t);
  }, [vendorQuery, open, selectedVendor]);

  function reset() {
    const nextSkuId = lockedSkuId ?? (skus.length === 1 ? skus[0]!.id : "");
    const sku = skus.find((s) => s.id === nextSkuId);
    const packaging = packagingFromSku(sku);
    setProductSkuId(nextSkuId);
    setVendorQuery("");
    setVendors([]);
    setSelectedVendor(null);
    setPurchasePrice("");
    setPurchaseUnitId(packaging.purchaseUnitId);
    setUnitsPerPurchaseUnit(packaging.unitsPerPurchaseUnit);
    setMoq("1");
    setLeadTimeDays("0");
    setIsPreferred(false);
    setNotes("");
    setError(null);
  }

  const lockedSku = lockedSkuId
    ? skus.find((s) => s.id === lockedSkuId)
    : null;

  async function onSave() {
    if (!productSkuId) {
      setError("Select a SKU first");
      return;
    }
    if (!selectedVendor) {
      setError("Select a vendor");
      return;
    }
    const price = Number(purchasePrice);
    if (Number.isNaN(price) || price < 0) {
      setError("Purchase price must be a valid number");
      return;
    }
    const unitsPerUnit = Number(unitsPerPurchaseUnit);
    if (Number.isNaN(unitsPerUnit) || unitsPerUnit <= 0) {
      setError("Units per purchase unit must be greater than zero");
      return;
    }
    const minimumOrderQuantity = Number(moq);
    if (Number.isNaN(minimumOrderQuantity) || minimumOrderQuantity < 0) {
      setError("Minimum order quantity must be a non-negative number");
      return;
    }
    const leadTime = Number(leadTimeDays);
    if (!Number.isInteger(leadTime) || leadTime < 0) {
      setError("Lead time must be a non-negative whole number");
      return;
    }

    setSaving(true);
    setError(null);
    let row: VendorSku;
    try {
      row = await vendorSkusApi.create({
        vendorId: selectedVendor.id,
        productSkuId,
        vendorSkuCode: null,
        purchasePrice: price,
        purchaseUnitId: purchaseUnitId || null,
        unitsPerPurchaseUnit: unitsPerUnit,
        minimumOrderQuantity,
        leadTimeDays: leadTime,
        isPreferred,
        notes: notes.trim(),
      });
    } catch (err: unknown) {
      setSaving(false);
      setError(getApiErrorMessage(err, "Failed to add supplier"));
      return;
    }

    let cacheWarning = false;
    try {
      await window.blackbox?.localDb?.upsertVendorSku(row);
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
          <DialogTitle>
            {lockedSkuId ? "Add Required Supplier" : "Add Supplier"}
          </DialogTitle>
        </DialogHeader>

        {lockedSkuId ? (
          <p className="text-muted-foreground text-sm">
            Every SKU needs at least one supplier. Link a vendor for this SKU to
            finish setup.
          </p>
        ) : null}

        {error ? (
          <div className="border-destructive/40 bg-destructive/5 text-destructive rounded-md border px-3 py-2 text-sm">
            {error}
          </div>
        ) : null}

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>SKU *</Label>
            {lockedSkuId ? (
              <Input
                value={
                  lockedSku
                    ? `${lockedSku.variantName || "—"} · ${lockedSku.sku}`
                    : lockedSkuId
                }
                disabled
              />
            ) : (
              <select
                className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                value={productSkuId}
                onChange={(e) => setProductSkuId(e.target.value)}
              >
                <option value="">Select SKU…</option>
                {skus.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.variantName || "—"} · {s.sku}
                  </option>
                ))}
              </select>
            )}
          </div>

          {!selectedVendor ? (
            <>
              <div className="space-y-1.5">
                <Label>Search vendor</Label>
                <Input
                  value={vendorQuery}
                  onChange={(e) => setVendorQuery(e.target.value)}
                  placeholder="ABC Trading"
                />
              </div>
              <ul className="border-border max-h-40 divide-y overflow-y-auto rounded-md border">
                {vendors.map((v) => (
                  <li key={v.id}>
                    <button
                      type="button"
                      className="hover:bg-muted/50 w-full px-3 py-2 text-left text-sm"
                      onClick={() => setSelectedVendor(v)}
                    >
                      <div className="font-medium">{v.name}</div>
                      <div className="text-muted-foreground">{v.vendorCode}</div>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="bg-muted/40 flex items-center justify-between rounded-md px-3 py-2 text-sm">
              <div>
                <div className="font-medium">{selectedVendor.name}</div>
                <div className="text-muted-foreground">
                  {selectedVendor.vendorCode}
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSelectedVendor(null)}
              >
                Change
              </Button>
            </div>
          )}

          {selectedVendor ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Purchase price *</Label>
                <Input
                  value={purchasePrice}
                  onChange={(e) => setPurchasePrice(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label>Purchase unit</Label>
                <select
                  className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                  value={purchaseUnitId}
                  onChange={(e) => setPurchaseUnitId(e.target.value)}
                >
                  <option value="">—</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Units / purchase unit</Label>
                <Input
                  value={unitsPerPurchaseUnit}
                  onChange={(e) => setUnitsPerPurchaseUnit(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>MOQ</Label>
                <Input value={moq} onChange={(e) => setMoq(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Lead time (days)</Label>
                <Input
                  value={leadTimeDays}
                  onChange={(e) => setLeadTimeDays(e.target.value)}
                />
              </div>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input
                  type="checkbox"
                  checked={isPreferred}
                  onChange={(e) => setIsPreferred(e.target.checked)}
                />
                Preferred supplier
              </label>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Notes</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                />
              </div>
            </div>
          ) : null}
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
            {saving ? "Saving…" : "Add supplier"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
