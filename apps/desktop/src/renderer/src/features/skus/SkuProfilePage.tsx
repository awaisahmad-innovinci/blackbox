import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type {
  EntityStatus,
  ProductSkuDetail,
  SkuDetail,
  SkuSupplier,
  WarehouseStockRow,
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
import { skusApi } from "@renderer/lib/api/skus";
import { loadSkuProfile } from "@renderer/lib/local-db/entity-source";
import {
  commitLocalChange,
  isDeviceBound,
} from "@renderer/lib/local-db/local-write";
import { unitsApi } from "@renderer/lib/api/units";
import type { UnitListItem } from "@blackbox/shared";
import { barcodeScanInputProps, useBarcodeScanTarget } from "@renderer/lib/barcode-scan";
import { syncNow } from "@renderer/lib/sync/sync-status";

function toProductSkuRow(
  sku: SkuDetail,
  status: EntityStatus,
): ProductSkuDetail {
  return {
    id: sku.id,
    productId: sku.productId,
    variantName: sku.variantName,
    sku: sku.sku,
    barcode: sku.barcode,
    sizeValue: sku.sizeValue,
    sizeUnit: sku.sizeUnit,
    baseUnitId: sku.baseUnitId,
    baseUnitName: sku.baseUnitName,
    purchaseUnitId: sku.purchaseUnitId,
    purchaseUnitName: sku.purchaseUnitName,
    unitsPerPurchaseUnit: sku.unitsPerPurchaseUnit,
    costPrice: sku.costPrice,
    sellingPrice: sku.sellingPrice,
    reorderLevel: sku.reorderLevel,
    minimumStockLevel: sku.minimumStockLevel,
    maximumStockLevel: sku.maximumStockLevel,
    trackInventory: sku.trackInventory,
    status,
  };
}

export function SkuProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [sku, setSku] = useState<SkuDetail | null>(null);
  const [suppliers, setSuppliers] = useState<SkuSupplier[]>([]);
  const [inventory, setInventory] = useState<WarehouseStockRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [units, setUnits] = useState<UnitListItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [variantName, setVariantName] = useState("");
  const [skuCode, setSkuCode] = useState("");
  const [barcode, setBarcode] = useState("");
  const [sizeValue, setSizeValue] = useState("");
  const [sizeUnit, setSizeUnit] = useState("");
  const [baseUnitId, setBaseUnitId] = useState("");
  const [purchaseUnitId, setPurchaseUnitId] = useState("");
  const [unitsPerPurchaseUnit, setUnitsPerPurchaseUnit] = useState("1");
  const [costPrice, setCostPrice] = useState("0");
  const [sellingPrice, setSellingPrice] = useState("0");
  const [reorderLevel, setReorderLevel] = useState("0");
  const [minimumStockLevel, setMinimumStockLevel] = useState("0");
  const [maximumStockLevel, setMaximumStockLevel] = useState("");
  const [trackInventory, setTrackInventory] = useState(true);
  const [status, setStatus] = useState<EntityStatus>("active");
  const barcodeRef = useRef<HTMLInputElement>(null);

  useBarcodeScanTarget({
    kind: "barcode",
    layer: "dialog",
    enabled: editOpen,
    inputRef: barcodeRef,
    onScan: (code) => {
      setBarcode(code);
      requestAnimationFrame(() => {
        barcodeRef.current?.focus();
        barcodeRef.current?.select();
      });
    },
  });

  async function reload() {
    if (!id) return;
    const data = await loadSkuProfile(id);
    setSku(data.sku);
    setSuppliers(data.suppliers);
    setInventory(data.inventory);
  }

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void reload().catch((err: unknown) => {
      if (!cancelled) {
        setError(getApiErrorMessage(err, "Failed to load SKU"));
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function openEdit() {
    if (!sku) return;
    setVariantName(sku.variantName);
    setSkuCode(sku.sku);
    setBarcode(sku.barcode ?? "");
    setSizeValue(sku.sizeValue ?? "");
    setSizeUnit(sku.sizeUnit ?? "");
    setBaseUnitId(sku.baseUnitId ?? "");
    setPurchaseUnitId(sku.purchaseUnitId ?? "");
    setUnitsPerPurchaseUnit(String(sku.unitsPerPurchaseUnit));
    setCostPrice(String(sku.costPrice));
    setSellingPrice(String(sku.sellingPrice));
    setReorderLevel(String(sku.reorderLevel));
    setMinimumStockLevel(String(sku.minimumStockLevel));
    setMaximumStockLevel(
      sku.maximumStockLevel == null ? "" : String(sku.maximumStockLevel),
    );
    setTrackInventory(sku.trackInventory);
    setStatus(sku.status);
    setFormError(null);
    void unitsApi.list().then(setUnits).catch(() => undefined);
    setEditOpen(true);
  }

  const unitsPerPurchaseUnitN = Number(unitsPerPurchaseUnit);
  const costPriceN = Number(costPrice);
  const sellingPriceN = Number(sellingPrice);
  const baseUnitError = baseUnitId ? null : "Base unit is required";
  const purchaseUnitError = purchaseUnitId ? null : "Purchase unit is required";
  const unitsPerError =
    !unitsPerPurchaseUnit.trim() ||
    Number.isNaN(unitsPerPurchaseUnitN) ||
    unitsPerPurchaseUnitN <= 0
      ? "Units / purchase unit must be greater than zero"
      : null;
  const costError =
    !costPrice.trim() || Number.isNaN(costPriceN) || costPriceN < 0
      ? "Cost price is required"
      : null;
  const sellingError =
    !sellingPrice.trim() || Number.isNaN(sellingPriceN) || sellingPriceN < 0
      ? "Selling price is required"
      : null;
  const canSaveEdit =
    Boolean(variantName.trim()) &&
    Boolean(skuCode.trim()) &&
    !baseUnitError &&
    !purchaseUnitError &&
    !unitsPerError &&
    !costError &&
    !sellingError;

  async function onSaveEdit() {
    if (!id || !sku || !canSaveEdit) return;
    setSaving(true);
    setFormError(null);
    const next: SkuDetail = {
      ...sku,
      variantName: variantName.trim(),
      sku: skuCode.trim(),
      barcode: barcode.trim() || null,
      sizeValue: sizeValue.trim() || null,
      sizeUnit: sizeUnit.trim() || null,
      baseUnitId,
      baseUnitName:
        units.find((u) => u.id === baseUnitId)?.name ?? sku.baseUnitName,
      purchaseUnitId,
      purchaseUnitName:
        units.find((u) => u.id === purchaseUnitId)?.name ??
        sku.purchaseUnitName,
      unitsPerPurchaseUnit: unitsPerPurchaseUnitN,
      costPrice: costPriceN,
      sellingPrice: sellingPriceN,
      reorderLevel: Number(reorderLevel),
      minimumStockLevel: Number(minimumStockLevel),
      maximumStockLevel:
        maximumStockLevel.trim() === "" ? null : Number(maximumStockLevel),
      trackInventory,
      status,
    };
    try {
      if (await isDeviceBound()) {
        await commitLocalChange({
          entityType: "product_sku",
          entityId: id,
          operation: status === "inactive" ? "DELETE" : "UPSERT",
          payload: toProductSkuRow(next, status) as unknown as Record<
            string,
            unknown
          >,
        });
        void syncNow();
        setSku(next);
        setEditOpen(false);
        return;
      }
      const updated = await skusApi.update(id, {
        variantName: next.variantName,
        sku: next.sku,
        barcode: next.barcode,
        sizeValue: next.sizeValue,
        sizeUnit: next.sizeUnit,
        baseUnitId,
        purchaseUnitId,
        unitsPerPurchaseUnit: unitsPerPurchaseUnitN,
        costPrice: costPriceN,
        sellingPrice: sellingPriceN,
        reorderLevel: next.reorderLevel,
        minimumStockLevel: next.minimumStockLevel,
        maximumStockLevel: next.maximumStockLevel,
        trackInventory,
        status,
      });
      try {
        await window.blackbox?.localDb?.upsertProductSku(
          toProductSkuRow(updated, updated.status),
        );
      } catch {
        /* optional cache */
      }
      setSku(updated);
      setEditOpen(false);
    } catch (err: unknown) {
      setFormError(getApiErrorMessage(err, "Failed to update SKU"));
    } finally {
      setSaving(false);
    }
  }

  async function onDeactivate() {
    if (!id || !sku) return;
    if (!window.confirm(`Deactivate SKU ${sku.sku}?`)) return;
    try {
      if (await isDeviceBound()) {
        const row = toProductSkuRow(sku, "inactive");
        await commitLocalChange({
          entityType: "product_sku",
          entityId: id,
          operation: "DELETE",
          payload: row as unknown as Record<string, unknown>,
        });
        void syncNow();
        setSku({ ...sku, status: "inactive" });
        return;
      }
      const updated = await skusApi.deactivate(id);
      try {
        await window.blackbox?.localDb?.upsertProductSku(
          toProductSkuRow(updated, "inactive"),
        );
      } catch {
        /* optional cache */
      }
      setSku({ ...updated, status: "inactive" });
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Failed to deactivate"));
    }
  }

  async function onActivate() {
    if (!id || !sku) return;
    const { baseUnitId, purchaseUnitId } = sku;
    if (!baseUnitId || !purchaseUnitId) {
      setError("Cannot activate SKU without base and purchase units.");
      return;
    }
    if (!window.confirm(`Activate SKU ${sku.sku}?`)) return;
    try {
      const active = { ...sku, status: "active" as const };
      if (await isDeviceBound()) {
        await commitLocalChange({
          entityType: "product_sku",
          entityId: id,
          operation: "UPSERT",
          payload: toProductSkuRow(active, "active") as unknown as Record<
            string,
            unknown
          >,
        });
        void syncNow();
        setSku(active);
        return;
      }
      const updated = await skusApi.update(id, {
        variantName: active.variantName,
        sku: active.sku,
        barcode: active.barcode,
        sizeValue: active.sizeValue,
        sizeUnit: active.sizeUnit,
        baseUnitId,
        purchaseUnitId,
        unitsPerPurchaseUnit: active.unitsPerPurchaseUnit,
        costPrice: active.costPrice,
        sellingPrice: active.sellingPrice,
        reorderLevel: active.reorderLevel,
        minimumStockLevel: active.minimumStockLevel,
        maximumStockLevel: active.maximumStockLevel,
        trackInventory: active.trackInventory,
        status: "active",
      });
      try {
        await window.blackbox?.localDb?.upsertProductSku(
          toProductSkuRow(updated, updated.status),
        );
      } catch {
        /* optional cache */
      }
      setSku(updated);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Failed to activate"));
    }
  }

  if (error && !sku) {
    return (
      <div
        role="alert"
        className="border-destructive/40 bg-destructive/5 text-destructive rounded-lg border px-4 py-3 text-sm"
      >
        {error}
      </div>
    );
  }

  if (!sku) {
    return <p className="text-muted-foreground text-sm">Loading…</p>;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-muted-foreground text-sm">
            <Link
              to={`/products/${sku.productId}`}
              className="text-primary hover:underline"
            >
              {sku.productName}
            </Link>{" "}
            · {sku.productCode}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {sku.variantName || sku.sku}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {sku.sku}
            {sku.barcode ? ` · ${sku.barcode}` : ""} ·{" "}
            <span className="capitalize">{sku.status}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={openEdit}>
            Edit
          </Button>
          {sku.status === "active" ? (
            <Button variant="outline" onClick={() => void onDeactivate()}>
              Deactivate
            </Button>
          ) : (
            <Button variant="outline" onClick={() => void onActivate()}>
              Activate
            </Button>
          )}
          <Button variant="ghost" onClick={() => navigate(-1)}>
            Back
          </Button>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Overview</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Size</dt>
            <dd className="font-medium">
              {[sku.sizeValue, sku.sizeUnit].filter(Boolean).join(" ") || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Base unit</dt>
            <dd className="font-medium">{sku.baseUnitName || "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Purchase unit</dt>
            <dd className="font-medium">
              {sku.purchaseUnitName || "—"}
              {sku.unitsPerPurchaseUnit
                ? ` (${sku.unitsPerPurchaseUnit} base)`
                : ""}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Cost / Selling</dt>
            <dd className="font-medium tabular-nums">
              {sku.costPrice} / {sku.sellingPrice}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Reorder / Min / Max</dt>
            <dd className="font-medium tabular-nums">
              {sku.reorderLevel} / {sku.minimumStockLevel} /{" "}
              {sku.maximumStockLevel ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Track inventory</dt>
            <dd className="font-medium">{sku.trackInventory ? "Yes" : "No"}</dd>
          </div>
        </dl>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Inventory by warehouse</h2>
        <div className="border-border overflow-hidden rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Warehouse</th>
                <th className="px-4 py-3 font-medium">On hand</th>
                <th className="px-4 py-3 font-medium">Reserved</th>
                <th className="px-4 py-3 font-medium">Available</th>
              </tr>
            </thead>
            <tbody>
              {inventory.length === 0 ? (
                <tr className="border-border border-t">
                  <td
                    colSpan={4}
                    className="text-muted-foreground px-4 py-6 text-center"
                  >
                    No stock lines.
                  </td>
                </tr>
              ) : (
                inventory.map((row) => (
                  <tr key={row.warehouseId} className="border-border border-t">
                    <td className="px-4 py-3">{row.warehouseName}</td>
                    <td className="px-4 py-3 tabular-nums">
                      {row.quantityOnHand}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {row.quantityReserved}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {row.quantityAvailable}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Suppliers</h2>
        <div className="border-border overflow-hidden rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Vendor</th>
                <th className="px-4 py-3 font-medium">Cost</th>
                <th className="px-4 py-3 font-medium">MOQ</th>
                <th className="px-4 py-3 font-medium">Lead Time</th>
                <th className="px-4 py-3 font-medium">Preferred</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.length === 0 ? (
                <tr className="border-border border-t">
                  <td
                    colSpan={5}
                    className="text-muted-foreground px-4 py-6 text-center"
                  >
                    No suppliers linked.
                  </td>
                </tr>
              ) : (
                suppliers.map((s) => (
                  <tr key={s.vendorSkuId} className="border-border border-t">
                    <td className="px-4 py-3">
                      <Link
                        to={`/vendors/${s.vendorId}`}
                        className="text-primary hover:underline"
                      >
                        {s.vendorName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 tabular-nums">{s.purchasePrice}</td>
                    <td className="px-4 py-3 tabular-nums">
                      {s.minimumOrderQuantity}
                    </td>
                    <td className="px-4 py-3">{s.leadTimeDays} days</td>
                    <td className="px-4 py-3">{s.isPreferred ? "Yes" : "No"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="fixed top-1/2 left-1/2 max-h-[85vh] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit SKU</DialogTitle>
          </DialogHeader>
          {formError ? (
            <div className="border-destructive/40 bg-destructive/5 text-destructive rounded-md border px-3 py-2 text-sm">
              {formError}
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Variant</Label>
              <Input
                value={variantName}
                onChange={(e) => setVariantName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>SKU</Label>
              <Input
                value={skuCode}
                onChange={(e) => setSkuCode(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Barcode</Label>
              <Input
                ref={barcodeRef}
                {...barcodeScanInputProps()}
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="Scan or type barcode"
                data-enter-submit=""
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Size value</Label>
              <Input
                value={sizeValue}
                onChange={(e) => setSizeValue(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Size unit</Label>
              <Input
                value={sizeUnit}
                onChange={(e) => setSizeUnit(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Base unit *</Label>
              <select
                className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                value={baseUnitId}
                aria-invalid={Boolean(baseUnitError)}
                onChange={(e) => setBaseUnitId(e.target.value)}
              >
                <option value="">—</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
              {baseUnitError ? (
                <p className="text-destructive text-xs">{baseUnitError}</p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label>Purchase unit *</Label>
              <select
                className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                value={purchaseUnitId}
                aria-invalid={Boolean(purchaseUnitError)}
                onChange={(e) => setPurchaseUnitId(e.target.value)}
              >
                <option value="">—</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
              {purchaseUnitError ? (
                <p className="text-destructive text-xs">{purchaseUnitError}</p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label>Units / purchase *</Label>
              <Input
                value={unitsPerPurchaseUnit}
                aria-invalid={Boolean(unitsPerError)}
                onChange={(e) => setUnitsPerPurchaseUnit(e.target.value)}
              />
              {unitsPerError ? (
                <p className="text-destructive text-xs">{unitsPerError}</p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label>Cost *</Label>
              <Input
                value={costPrice}
                aria-invalid={Boolean(costError)}
                onChange={(e) => setCostPrice(e.target.value)}
              />
              {costError ? (
                <p className="text-destructive text-xs">{costError}</p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label>Selling *</Label>
              <Input
                value={sellingPrice}
                aria-invalid={Boolean(sellingError)}
                onChange={(e) => setSellingPrice(e.target.value)}
              />
              {sellingError ? (
                <p className="text-destructive text-xs">{sellingError}</p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label>Reorder</Label>
              <Input
                value={reorderLevel}
                onChange={(e) => setReorderLevel(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Min stock</Label>
              <Input
                value={minimumStockLevel}
                onChange={(e) => setMinimumStockLevel(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Max stock</Label>
              <Input
                value={maximumStockLevel}
                onChange={(e) => setMaximumStockLevel(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sku-status">Status</Label>
              <select
                id="sku-status"
                className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                value={status}
                onChange={(e) => setStatus(e.target.value as EntityStatus)}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                checked={trackInventory}
                onChange={(e) => setTrackInventory(e.target.checked)}
              />
              Track inventory
            </label>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => setEditOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={saving || !canSaveEdit}
              onClick={() => void onSaveEdit()}
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
