import { useEffect, useMemo, useState } from "react";
import type {
  ProductSkuDetail,
  ProductSupplierRow,
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
import {
  FormEnterNav,
  formSelectPickerProps,
} from "@renderer/components/form-enter-nav";
import {
  KEYBOARD_HINT_PICK_ROWS,
  KeyboardHints,
} from "@renderer/components/keyboard-hints";
import { ListPickRow } from "@renderer/components/list-table-row";
import { getApiErrorMessage } from "@renderer/lib/api/client";
import { handleDialogOpenChange } from "@renderer/lib/on-dialog-open-change";
import { vendorSkusApi } from "@renderer/lib/api/vendor-skus";
import { loadVendors } from "@renderer/lib/local-db/entity-source";
import { commitLocalChange, isDeviceBound } from "@renderer/lib/local-db/local-write";
import { syncNow } from "@renderer/lib/sync/sync-status";

function purchasePriceFromSku(sku: ProductSkuDetail | undefined): number {
  const unitsPer =
    sku?.unitsPerPurchaseUnit != null && sku.unitsPerPurchaseUnit > 0
      ? sku.unitsPerPurchaseUnit
      : 1;
  return (sku?.costPrice ?? 0) * unitsPer;
}

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
  existingSuppliers,
  onClose,
  onCreated,
}: {
  open: boolean;
  skus: ProductSkuDetail[];
  /** When set, SKU is fixed (required first supplier after Add SKU). */
  lockedSkuId?: string | null;
  existingSuppliers?: ProductSupplierRow[];
  onClose: () => void;
  onCreated: (row: VendorSku, cacheWarning: boolean) => void;
}) {
  const [productSkuId, setProductSkuId] = useState("");
  const [vendorQuery, setVendorQuery] = useState("");
  const [vendors, setVendors] = useState<VendorListItem[]>([]);
  const [selectedVendor, setSelectedVendor] = useState<VendorListItem | null>(
    null,
  );
  const [purchaseUnitId, setPurchaseUnitId] = useState("");
  const [unitsPerPurchaseUnit, setUnitsPerPurchaseUnit] = useState("1");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [moq, setMoq] = useState("1");
  const [leadTimeDays, setLeadTimeDays] = useState("0");
  const [isPreferred, setIsPreferred] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
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
    setPurchasePrice(String(purchasePriceFromSku(sku)));
  }, [open, productSkuId, skus]);

  useEffect(() => {
    if (!open || selectedVendor) return;
    const t = setTimeout(() => {
      void loadVendors({
        search: vendorQuery.trim() || undefined,
        status: "active",
      })
        .then((res) =>
          setVendors(res.items.filter((v) => v.status === "active")),
        )
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
    setPurchaseUnitId(packaging.purchaseUnitId);
    setUnitsPerPurchaseUnit(packaging.unitsPerPurchaseUnit);
    setPurchasePrice(String(purchasePriceFromSku(sku)));
    setMoq("1");
    setLeadTimeDays("0");
    setIsPreferred(false);
    setError(null);
  }

  const lockedSku = lockedSkuId
    ? skus.find((s) => s.id === lockedSkuId)
    : null;
  const selectedSku = productSkuId
    ? skus.find((s) => s.id === productSkuId)
    : undefined;

  const linkedVendorIds = useMemo(
    () =>
      new Set(
        existingSuppliers
          ?.filter((s) => s.productSkuId === productSkuId)
          .map((s) => s.vendorId) ?? [],
      ),
    [existingSuppliers, productSkuId],
  );

  async function onSave() {
    if (!productSkuId) {
      setError("Select a SKU first");
      return;
    }
    if (!selectedVendor) {
      setError("Select a vendor");
      return;
    }
    if (linkedVendorIds.has(selectedVendor.id)) {
      setError("This vendor is already linked to this SKU");
      return;
    }
    if (!selectedSku) {
      setError("Select a SKU first");
      return;
    }
    const price = Number(purchasePrice);
    if (Number.isNaN(price) || price < 0) {
      setError("Purchase price must be a non-negative number");
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

    const sku = selectedSku;

    setSaving(true);
    setError(null);
    let row: VendorSku;
    try {
      if (await isDeviceBound()) {
        const localId = crypto.randomUUID();
        row = {
          id: localId,
          vendorId: selectedVendor.id,
          productSkuId,
          vendorSkuCode: null,
          purchasePrice: price,
          purchaseUnitId: purchaseUnitId || null,
          purchaseUnitName: sku?.purchaseUnitName ?? null,
          unitsPerPurchaseUnit: unitsPerUnit,
          minimumOrderQuantity,
          leadTimeDays: leadTime,
          isPreferred,
          status: "active",
          notes: "",
          productName: sku?.variantName || sku?.sku || "",
          variantName: sku?.variantName ?? "",
          sku: sku?.sku ?? "",
          barcode: sku?.barcode ?? null,
        };
        await commitLocalChange({
          entityType: "vendor_sku",
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
        notes: "",
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
        handleDialogOpenChange(
          next,
          () => {
            reset();
            onClose();
          },
          !saving,
        );
      }}
    >
      <DialogContent className="fixed top-1/2 left-1/2 max-h-[85vh] w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto">
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

        <FormEnterNav className="space-y-3">
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
                {...formSelectPickerProps()}
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
                {vendors.map((v) => {
                  const alreadyLinked = linkedVendorIds.has(v.id);
                  return (
                    <ListPickRow
                      key={v.id}
                      disabled={alreadyLinked}
                      onActivate={() => {
                        if (!alreadyLinked) setSelectedVendor(v);
                      }}
                    >
                      <div className="px-3 py-2 text-sm">
                        <div className="font-medium">
                          {v.name}
                          {alreadyLinked ? (
                            <span className="text-muted-foreground ml-2 text-xs font-normal">
                              Already linked
                            </span>
                          ) : null}
                        </div>
                        <div className="text-muted-foreground">{v.vendorCode}</div>
                      </div>
                    </ListPickRow>
                  );
                })}
              </ul>
              <KeyboardHints hints={[KEYBOARD_HINT_PICK_ROWS]} />
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
                <Label>
                  Purchase price
                  {selectedSku?.purchaseUnitName
                    ? ` (per ${selectedSku.purchaseUnitName})`
                    : ""}
                  *
                </Label>
                <Input
                  type="number"
                  min={0}
                  step="any"
                  value={purchasePrice}
                  onChange={(e) => setPurchasePrice(e.target.value)}
                  autoFocus
                />
                <p className="text-muted-foreground text-xs">
                  Defaults from SKU cost; change if this vendor&apos;s price
                  differs.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Purchase unit</Label>
                <Input
                  value={selectedSku?.purchaseUnitName || "—"}
                  disabled
                />
              </div>
              <div className="space-y-1.5">
                <Label>Units / purchase unit</Label>
                <Input
                  value={
                    selectedSku?.unitsPerPurchaseUnit != null
                      ? String(selectedSku.unitsPerPurchaseUnit)
                      : "—"
                  }
                  disabled
                />
              </div>
              <div className="space-y-1.5">
                <Label>MOQ</Label>
                <Input
                  value={moq}
                  onChange={(e) => setMoq(e.target.value)}
                />
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
            </div>
          ) : null}
        </FormEnterNav>

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
