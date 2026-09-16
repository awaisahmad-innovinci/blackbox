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
  loadPosAvailableForSale,
  loadSkuProfile,
  loadSkuSearch,
} from "@renderer/lib/local-db/entity-source";
import { barcodeScanInputProps, useBarcodeScanTarget } from "@renderer/lib/barcode-scan";
import {
  KEYBOARD_HINT_PICK_ROWS,
  KeyboardHints,
} from "@renderer/components/keyboard-hints";
import { ListPickFocusable, ListPickRow } from "@renderer/components/list-table-row";

export function AddSaleItemDialog({
  open,
  warehouseId,
  excludeDraftSaleId,
  onClose,
  onAddMany,
}: {
  open: boolean;
  warehouseId: string;
  excludeDraftSaleId?: string | null;
  onClose: () => void;
  onAddMany: (rows: SkuSearchResult[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SkuSearchResult[]>([]);
  const [posBalanceBySkuId, setPosBalanceBySkuId] = useState<Map<string, number>>(
    new Map(),
  );
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
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
      setPosBalanceBySkuId(new Map());
      return;
    }
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        results.map(async (row) => {
          const qty = await loadPosAvailableForSale(
            warehouseId,
            row.id,
            excludeDraftSaleId,
          );
          return [row.id, qty] as const;
        }),
      );
      if (!cancelled) {
        setPosBalanceBySkuId(new Map(entries));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, warehouseId, results, excludeDraftSaleId]);

  function reset() {
    setQuery("");
    setResults([]);
    setPosBalanceBySkuId(new Map());
    setSelectedIds([]);
    setConfirming(false);
  }

  function posBalance(row: SkuSearchResult): number {
    return posBalanceBySkuId.get(row.id) ?? 0;
  }

  function isUnavailable(row: SkuSearchResult): boolean {
    return posBalance(row) <= 0;
  }

  function toggle(id: string) {
    const row = results.find((r) => r.id === id);
    if (!row || isUnavailable(row)) return;
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function onConfirm() {
    const chosen = results.filter(
      (r) => selectedIds.includes(r.id) && !isUnavailable(r),
    );
    if (chosen.length === 0) return;

    setConfirming(true);
    try {
      const rows = await Promise.all(
        chosen.map(async (row) => {
          const qty = posBalance(row);
          const profile = await loadSkuProfile(row.id);
          return {
            ...row,
            quantityAvailable: qty,
            sellingPrice: profile.sku.sellingPrice,
            sellingPricePerPurchaseUnit: profile.sku.sellingPricePerPurchaseUnit,
            unitsPerPurchaseUnit: profile.sku.unitsPerPurchaseUnit,
            costPrice: profile.sku.costPrice,
          } satisfies SkuSearchResult;
        }),
      );
      onAddMany(rows);
      reset();
      onClose();
    } finally {
      setConfirming(false);
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
      <DialogContent className="fixed top-1/2 left-1/2 max-h-[85vh] w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add items</DialogTitle>
        </DialogHeader>

        <p className="text-muted-foreground text-sm">
          Search by product name, SKU code, or barcode. Only items with POS
          floor balance can be sold.
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
                const balance = posBalance(r);
                const balancePending =
                  !posBalanceBySkuId.has(r.id) && results.length > 0;
                const unavailable = !balancePending && isUnavailable(r);
                const disabled = unavailable || balancePending;
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
                      {balancePending ? (
                        <span className="text-muted-foreground ml-2 text-xs">
                          Checking…
                        </span>
                      ) : unavailable ? (
                        <span className="text-muted-foreground ml-2 text-xs">
                          No POS balance
                        </span>
                      ) : null}
                      <span className="text-muted-foreground block">
                        {r.variantName || "—"} · {r.sku}
                        {r.barcode ? ` · ${r.barcode}` : ""}
                      </span>
                      {!balancePending && !unavailable ? (
                        <span className="text-muted-foreground block tabular-nums">
                          POS balance {balance.toLocaleString()}
                          {(r.sellingPrice ?? 0) > 0
                            ? ` · Price ${(r.sellingPrice ?? 0).toLocaleString()}`
                            : ""}
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
            disabled={selectedIds.length === 0 || confirming}
            onClick={() => void onConfirm()}
          >
            {confirming
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
