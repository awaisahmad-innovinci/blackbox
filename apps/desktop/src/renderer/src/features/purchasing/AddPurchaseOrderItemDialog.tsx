import { useEffect, useMemo, useRef, useState } from "react";
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
import { loadVendorSkus } from "@renderer/lib/local-db/entity-source";
import { barcodeScanInputProps, useBarcodeScanTarget } from "@renderer/lib/barcode-scan";
import {
  KEYBOARD_HINT_PICK_ROWS,
  KeyboardHints,
} from "@renderer/components/keyboard-hints";
import { ListPickFocusable, ListPickRow } from "@renderer/components/list-table-row";

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

function isDisabled(row: VendorSku, existingSkuIds: string[]): boolean {
  return existingSkuIds.includes(row.productSkuId);
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

  function rowDisabled(row: VendorSku): boolean {
    return isDisabled(row, existingSkuIds);
  }

  const selectableIds = useMemo(
    () =>
      results
        .filter((r) => !existingSkuIds.includes(r.productSkuId))
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

  function onConfirm() {
    const chosen = results.filter(
      (r) => selectedIds.includes(r.id) && !rowDisabled(r),
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
      <DialogContent className="fixed top-1/2 left-1/2 max-h-[85vh] w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Items</DialogTitle>
        </DialogHeader>

        <p className="text-muted-foreground text-sm">
          Select one or more SKUs supplied by this vendor. They are added with
          quantity 0 — enter quantities in the order items table.
        </p>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Search SKUs supplied by this vendor</Label>
            <Input
              ref={queryRef}
              {...barcodeScanInputProps()}
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
              <>
                <ListPickRow
                  disabled={selectableIds.length === 0}
                  onActivate={toggleSelectAll}
                  className="flex items-center gap-3 px-3 py-2 text-sm"
                >
                  <ListPickFocusable>
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      className="pointer-events-none mt-0.5"
                      checked={allSelected}
                      disabled={selectableIds.length === 0}
                      readOnly
                    />
                  </ListPickFocusable>
                  <span className="font-medium">Select all</span>
                  <span className="text-muted-foreground text-xs">
                    {selectableIds.length} SKUs
                  </span>
                </ListPickRow>
                {results.map((r) => {
                  const added = existingSkuIds.includes(r.productSkuId);
                  const disabled = rowDisabled(r);
                  const checked = selectedIds.includes(r.id);
                  return (
                    <ListPickRow
                      key={r.id}
                      disabled={disabled}
                      onActivate={() => toggle(r.id)}
                      className="flex items-start gap-3 px-3 py-2 text-sm"
                    >
                      <ListPickFocusable>
                        <input
                          type="checkbox"
                          className="pointer-events-none mt-1"
                          checked={checked}
                          disabled={disabled}
                          readOnly
                        />
                      </ListPickFocusable>
                      <span className="flex-1">
                        <span className="font-medium">{r.productName}</span>
                        {added ? (
                          <span className="text-muted-foreground ml-2 text-xs">
                            Added
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
                    </ListPickRow>
                  );
                })}
              </>
            )}
          </ul>
          <KeyboardHints hints={[KEYBOARD_HINT_PICK_ROWS]} />
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
