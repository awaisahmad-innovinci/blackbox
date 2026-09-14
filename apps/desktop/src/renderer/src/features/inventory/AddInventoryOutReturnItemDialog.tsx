import { useEffect, useRef, useState } from "react";
import type { SkuSearchResult } from "@blackbox/shared";
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
  loadInventoryOutReturnableQuantity,
  loadSkuSearch,
} from "@renderer/lib/local-db/entity-source";
import { barcodeScanInputProps, useBarcodeScanTarget } from "@renderer/lib/barcode-scan";
import {
  KEYBOARD_HINT_PICK_ROWS,
  KeyboardHints,
} from "@renderer/components/keyboard-hints";
import { ListPickFocusable, ListPickRow } from "@renderer/components/list-table-row";

export type DraftOutReturnLine = {
  productSkuId: string;
  productName: string;
  variantName: string;
  sku: string;
  quantity: number;
  quantityAvailable: number;
  unitCost: number;
};

export function toDraftOutReturnLine(
  row: SkuSearchResult,
  returnableQty: number,
): DraftOutReturnLine {
  return {
    productSkuId: row.id,
    productName: row.productName,
    variantName: row.variantName,
    sku: row.sku,
    quantity: Math.min(1, returnableQty),
    quantityAvailable: returnableQty,
    unitCost: row.costPrice ?? 0,
  };
}

export function AddInventoryOutReturnItemDialog({
  open,
  warehouseId,
  existingSkuIds,
  onClose,
  onAddMany,
}: {
  open: boolean;
  warehouseId: string;
  existingSkuIds: string[];
  onClose: () => void;
  onAddMany: (lines: DraftOutReturnLine[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SkuSearchResult[]>([]);
  const [outBalanceBySkuId, setOutBalanceBySkuId] = useState<Map<string, number>>(
    new Map(),
  );
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const queryRef = useRef<HTMLInputElement>(null);

  useBarcodeScanTarget({
    kind: "search",
    layer: "dialog",
    enabled: open,
    inputRef: queryRef,
    onScan: setQuery,
  });

  useEffect(() => {
    if (!open || !warehouseId) return;
    const t = setTimeout(() => {
      void loadSkuSearch(query, warehouseId)
        .then(setResults)
        .catch(() => setResults([]));
    }, 200);
    return () => clearTimeout(t);
  }, [query, open, warehouseId]);

  useEffect(() => {
    if (!open || !warehouseId || results.length === 0) {
      setOutBalanceBySkuId(new Map());
      return;
    }
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        results.map(async (row) => {
          const { quantityAvailable } = await loadInventoryOutReturnableQuantity(
            warehouseId,
            row.id,
          );
          return [row.id, quantityAvailable] as const;
        }),
      );
      if (!cancelled) {
        setOutBalanceBySkuId(new Map(entries));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, warehouseId, results]);

  function reset() {
    setQuery("");
    setResults([]);
    setOutBalanceBySkuId(new Map());
    setSelectedIds([]);
  }

  function outBalance(row: SkuSearchResult): number {
    return outBalanceBySkuId.get(row.id) ?? 0;
  }

  function isUnavailable(row: SkuSearchResult): boolean {
    return outBalance(row) <= 0;
  }

  function isDisabled(row: SkuSearchResult): boolean {
    return existingSkuIds.includes(row.id) || isUnavailable(row);
  }

  function toggle(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function onConfirm() {
    const chosen = results.filter(
      (r) => selectedIds.includes(r.id) && !isDisabled(r),
    );
    if (chosen.length === 0) return;
    onAddMany(chosen.map((r) => toDraftOutReturnLine(r, outBalance(r))));
    reset();
    onClose();
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
          <DialogTitle>Add SKUs</DialogTitle>
        </DialogHeader>

        <p className="text-muted-foreground text-sm">
          Search by product name or SKU code. Only SKUs with POS out balance can
          be returned.
        </p>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Search product / SKU</Label>
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
                No matching SKUs.
              </li>
            ) : (
              results.map((r) => {
                const added = existingSkuIds.includes(r.id);
                const balance = outBalance(r);
                const balancePending =
                  !outBalanceBySkuId.has(r.id) && results.length > 0;
                const unavailable = !balancePending && isUnavailable(r);
                const disabled = added || unavailable || balancePending;
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
                      ) : balancePending ? (
                        <span className="text-muted-foreground ml-2 text-xs">
                          Checking…
                        </span>
                      ) : unavailable ? (
                        <span className="text-muted-foreground ml-2 text-xs">
                          No out balance
                        </span>
                      ) : null}
                      <span className="text-muted-foreground block">
                        {r.variantName || "—"} · {r.sku}
                        {r.barcode ? ` · ${r.barcode}` : ""}
                      </span>
                      {!balancePending && !unavailable ? (
                        <span className="text-muted-foreground block tabular-nums">
                          Out balance {balance.toLocaleString()} · Avg cost{" "}
                          {(r.costPrice ?? 0).toLocaleString()}
                        </span>
                      ) : null}
                    </span>
                  </ListPickRow>
                );
              })
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
