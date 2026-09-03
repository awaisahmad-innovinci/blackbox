import { useEffect, useMemo, useRef, useState } from "react";
import type { VendorReturnReason, VendorSku } from "@blackbox/shared";
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
  loadLastPurchaseCost,
  loadVendorSkus,
} from "@renderer/lib/local-db/entity-source";
import { barcodeScanInputProps, useBarcodeScanTarget } from "@renderer/lib/barcode-scan";

export type DraftReturnLine = {
  productSkuId: string;
  vendorSkuId: string;
  productName: string;
  variantName: string;
  sku: string;
  barcode: string | null;
  purchaseUnitId: string | null;
  purchaseUnitName: string | null;
  unitsPerPurchaseUnit: number;
  quantityAvailable: number;
  quantity: number;
  unitCost: number;
  reason: VendorReturnReason;
  lineTotal: number;
};

export function toDraftReturnLine(row: VendorSku, unitCost: number): DraftReturnLine {
  const unitsPer =
    row.unitsPerPurchaseUnit > 0 ? row.unitsPerPurchaseUnit : 1;
  return {
    productSkuId: row.productSkuId,
    vendorSkuId: row.id,
    productName: row.productName,
    variantName: row.variantName,
    sku: row.sku,
    barcode: row.barcode,
    purchaseUnitId: row.purchaseUnitId,
    purchaseUnitName: row.purchaseUnitName,
    unitsPerPurchaseUnit: unitsPer,
    quantityAvailable: row.quantityAvailable ?? 0,
    quantity: 0,
    unitCost,
    reason: "EXPIRED",
    lineTotal: 0,
  };
}

function isUnavailable(row: VendorSku): boolean {
  return (row.quantityAvailable ?? 0) <= 0;
}

export function AddVendorReturnItemDialog({
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
  onAddMany: (lines: DraftReturnLine[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<VendorSku[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const queryRef = useRef<HTMLInputElement>(null);

  useBarcodeScanTarget({
    kind: "search",
    layer: "dialog",
    enabled: open,
    inputRef: queryRef,
    onScan: setQuery,
  });

  useEffect(() => {
    if (!open || !vendorId || !warehouseId) return;
    const t = setTimeout(() => {
      void loadVendorSkus(vendorId, query, warehouseId)
        .then(setResults)
        .catch(() => setResults([]));
    }, 200);
    return () => clearTimeout(t);
  }, [query, open, vendorId, warehouseId]);

  function isDisabled(row: VendorSku): boolean {
    return existingSkuIds.includes(row.productSkuId) || isUnavailable(row);
  }

  const selectableIds = useMemo(
    () =>
      results
        .filter(
          (r) =>
            !existingSkuIds.includes(r.productSkuId) &&
            (r.quantityAvailable ?? 0) > 0,
        )
        .map((r) => r.id),
    [results, existingSkuIds],
  );

  const allSelected =
    selectableIds.length > 0 &&
    selectableIds.every((id) => selectedIds.includes(id));
  const someSelected = selectableIds.some((id) => selectedIds.includes(id));

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someSelected && !allSelected;
    }
  }, [someSelected, allSelected]);

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

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !selectableIds.includes(id)));
      return;
    }
    setSelectedIds((prev) => [...new Set([...prev, ...selectableIds])]);
  }

  async function onConfirm() {
    const chosen = results.filter(
      (r) => selectedIds.includes(r.id) && !isDisabled(r),
    );
    if (chosen.length === 0) return;

    setAdding(true);
    try {
      const lines = await Promise.all(
        chosen.map(async (row) => {
          let unitCost = row.purchasePrice;
          try {
            unitCost = await loadLastPurchaseCost(vendorId, row.productSkuId);
          } catch {
            /* fallback to purchasePrice */
          }
          return toDraftReturnLine(row, unitCost);
        }),
      );
      onAddMany(lines);
      reset();
      onClose();
    } finally {
      setAdding(false);
    }
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
          <DialogTitle>Add return items</DialogTitle>
        </DialogHeader>

        <p className="text-muted-foreground text-sm">
          Select one or more SKUs with available stock. They are added with
          quantity 0 — enter quantities and reasons in the return items table.
        </p>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Search vendor SKUs</Label>
            <Input
              ref={queryRef}
              {...barcodeScanInputProps()}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              autoFocus
            />
          </div>
          <ul className="border-border max-h-72 divide-y overflow-y-auto rounded-md border">
            {results.length === 0 ? (
              <li className="text-muted-foreground px-3 py-4 text-sm">
                No matching SKUs for this vendor.
              </li>
            ) : (
              <>
                <li>
                  <label
                    className={
                      selectableIds.length === 0
                        ? "flex cursor-not-allowed items-center gap-3 px-3 py-2 text-sm opacity-60"
                        : "hover:bg-muted/50 flex cursor-pointer items-center gap-3 px-3 py-2 text-sm"
                    }
                  >
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      className="mt-0.5"
                      checked={allSelected}
                      disabled={selectableIds.length === 0}
                      onChange={toggleSelectAll}
                    />
                    <span className="font-medium">Select all</span>
                    <span className="text-muted-foreground text-xs">
                      {selectableIds.length} with stock
                    </span>
                  </label>
                </li>
                {results.map((r) => {
                  const added = existingSkuIds.includes(r.productSkuId);
                  const unavailable = isUnavailable(r);
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
                            <span className="text-muted-foreground ml-2 text-xs">
                              Unavailable
                            </span>
                          ) : null}
                          <span className="text-muted-foreground block">
                            {r.variantName || "—"} · {r.sku}
                            {r.barcode ? ` · ${r.barcode}` : ""}
                          </span>
                          <span className="text-muted-foreground block tabular-nums">
                            Cost {r.purchasePrice.toLocaleString()} ·{" "}
                            {r.purchaseUnitName || "—"} · Available{" "}
                            {(r.quantityAvailable ?? 0).toLocaleString()}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </>
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
            disabled={selectedIds.length === 0 || adding}
            onClick={() => void onConfirm()}
          >
            {adding
              ? "Adding…"
              : selectedIds.length > 1
                ? `Add ${selectedIds.length} items`
                : "Add item"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
