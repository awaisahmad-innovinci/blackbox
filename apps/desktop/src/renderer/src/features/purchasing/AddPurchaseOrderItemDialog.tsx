import { useEffect, useState } from "react";
import type { VendorSku } from "@blackbox/shared";
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
import { vendorSkusApi } from "@renderer/lib/api/vendor-skus";

export type DraftPoLine = {
  productSkuId: string;
  vendorSkuId: string;
  productName: string;
  variantName: string;
  sku: string;
  purchaseUnitId: string | null;
  purchaseUnitName: string | null;
  unitsPerPurchaseUnit: number;
  quantityAvailable: number;
  quantity: number;
  unitCost: number;
  minimumOrderQuantity: number;
  lineTotal: number;
};

export function toDraftPoLine(row: VendorSku): DraftPoLine {
  return {
    productSkuId: row.productSkuId,
    vendorSkuId: row.id,
    productName: row.productName,
    variantName: row.variantName,
    sku: row.sku,
    purchaseUnitId: row.purchaseUnitId,
    purchaseUnitName: row.purchaseUnitName,
    unitsPerPurchaseUnit: row.unitsPerPurchaseUnit,
    quantityAvailable: row.quantityAvailable ?? 0,
    quantity: 0,
    unitCost: row.purchasePrice,
    minimumOrderQuantity: row.minimumOrderQuantity,
    lineTotal: 0,
  };
}

export function AddPurchaseOrderItemDialog({
  open,
  vendorId,
  warehouseId,
  existingSkuIds,
  onClose,
  onAddMany,
}: {
  open: boolean;
  vendorId: string;
  warehouseId: string;
  existingSkuIds: string[];
  onClose: () => void;
  onAddMany: (lines: DraftPoLine[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<VendorSku[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    if (!open || !vendorId || !warehouseId) return;
    const t = setTimeout(() => {
      void vendorSkusApi
        .listByVendor(vendorId, query, warehouseId)
        .then(setResults)
        .catch(() => setResults([]));
    }, 200);
    return () => clearTimeout(t);
  }, [query, open, vendorId, warehouseId]);

  function reset() {
    setQuery("");
    setResults([]);
    setSelectedIds([]);
  }

  function toggle(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function onConfirm() {
    const chosen = results.filter(
      (r) =>
        selectedIds.includes(r.id) &&
        (r.quantityAvailable ?? 0) >= 1 &&
        !existingSkuIds.includes(r.productSkuId),
    );
    if (chosen.length === 0) return;
    onAddMany(chosen.map(toDraftPoLine));
    reset();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className="fixed top-1/2 left-1/2 max-h-[85vh] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Items</DialogTitle>
        </DialogHeader>

        <p className="text-muted-foreground text-sm">
          Select one or more SKUs. They are added with quantity 0 — enter
          quantities in the order items table.
        </p>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Search SKUs supplied by this vendor</Label>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Pepsi"
              autoFocus
            />
          </div>
          <ul className="border-border max-h-72 divide-y overflow-y-auto rounded-md border">
            {results.length === 0 ? (
              <li className="text-muted-foreground px-3 py-4 text-sm">
                No matching SKUs for this vendor.
              </li>
            ) : (
              results.map((r) => {
                const added = existingSkuIds.includes(r.productSkuId);
                const unavailable = (r.quantityAvailable ?? 0) < 1;
                const disabled = added || unavailable;
                const checked = selectedIds.includes(r.id);
                return (
                  <li key={r.id}>
                    <label
                      className={
                        disabled
                          ? "flex cursor-not-allowed items-start gap-3 px-3 py-2 text-sm opacity-60"
                          : "hover:bg-muted/50 flex cursor-pointer items-start gap-3 px-3 py-2 text-sm"
                      }
                    >
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={checked}
                        disabled={disabled}
                        onChange={() => toggle(r.id)}
                      />
                      <span className="flex-1">
                        <span className="font-medium">{r.productName}</span>
                        {added ? (
                          <span className="text-muted-foreground ml-2 text-xs">
                            Added
                          </span>
                        ) : unavailable ? (
                          <span className="text-destructive ml-2 text-xs">
                            Unavailable
                          </span>
                        ) : null}
                        <span className="text-muted-foreground block">
                          {r.variantName || "—"} · {r.sku}
                          {r.barcode ? ` · ${r.barcode}` : ""}
                        </span>
                        <span className="text-muted-foreground block tabular-nums">
                          Cost {r.purchasePrice.toLocaleString()} ·{" "}
                          {r.purchaseUnitName || "—"} · MOQ{" "}
                          {r.minimumOrderQuantity} · Available{" "}
                          {(r.quantityAvailable ?? 0).toLocaleString()}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })
            )}
          </ul>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={selectedIds.length === 0}
            onClick={onConfirm}
          >
            {selectedIds.length > 1
              ? `Add ${selectedIds.length} items`
              : "Add item"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
