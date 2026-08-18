import { useEffect, useState } from "react";
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
import { skusApi } from "@renderer/lib/api/skus";

export type DraftOutLine = {
  productSkuId: string;
  productName: string;
  variantName: string;
  sku: string;
  barcode: string | null;
  quantity: number;
  quantityAvailable: number;
  costPrice: number;
};

export function AddInventoryOutItemDialog({
  open,
  warehouseId,
  existingSkuIds,
  onClose,
  onAdd,
}: {
  open: boolean;
  warehouseId: string;
  existingSkuIds: string[];
  onClose: () => void;
  onAdd: (line: DraftOutLine) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SkuSearchResult[]>([]);
  const [selected, setSelected] = useState<SkuSearchResult | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !warehouseId || selected) return;
    const t = setTimeout(() => {
      void skusApi
        .search(query, warehouseId)
        .then(setResults)
        .catch(() => setResults([]));
    }, 200);
    return () => clearTimeout(t);
  }, [query, open, warehouseId, selected]);

  function reset() {
    setQuery("");
    setResults([]);
    setSelected(null);
    setQuantity("1");
    setError(null);
  }

  function onSelect(row: SkuSearchResult) {
    if (existingSkuIds.includes(row.id)) {
      setError("This SKU is already on the list. Edit the existing line.");
      return;
    }
    const available = row.quantityAvailable ?? 0;
    if (available <= 0) {
      setError("No available quantity for this SKU in the selected warehouse.");
      return;
    }
    setSelected(row);
    setQuantity("1");
    setError(null);
  }

  function onConfirm() {
    if (!selected) {
      setError("Select an SKU");
      return;
    }
    const qty = Number(quantity);
    const available = selected.quantityAvailable ?? 0;
    if (Number.isNaN(qty) || qty <= 0) {
      setError("Quantity must be greater than zero");
      return;
    }
    if (qty > available) {
      setError(`Quantity cannot exceed available (${available})`);
      return;
    }
    onAdd({
      productSkuId: selected.id,
      productName: selected.productName,
      variantName: selected.variantName,
      sku: selected.sku,
      barcode: selected.barcode,
      quantity: qty,
      quantityAvailable: available,
      costPrice: selected.costPrice ?? 0,
    });
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
          <DialogTitle>Add SKU</DialogTitle>
        </DialogHeader>

        {error ? (
          <div className="border-destructive/40 bg-destructive/5 text-destructive rounded-md border px-3 py-2 text-sm">
            {error}
          </div>
        ) : null}

        {!selected ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Search product / SKU</Label>
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
                autoFocus
              />
            </div>
            <ul className="border-border max-h-56 divide-y overflow-y-auto rounded-md border">
              {results.length === 0 ? (
                <li className="text-muted-foreground px-3 py-4 text-sm">
                  No matching SKUs.
                </li>
              ) : (
                results.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      className="hover:bg-muted/50 w-full px-3 py-2 text-left text-sm"
                      onClick={() => onSelect(r)}
                    >
                      <div className="font-medium">{r.productName}</div>
                      <div className="text-muted-foreground">
                        {r.variantName || "—"} · {r.sku}
                      </div>
                      <div className="text-muted-foreground mt-0.5 tabular-nums">
                        Available: {(r.quantityAvailable ?? 0).toLocaleString()}{" "}
                        · Avg cost: {(r.costPrice ?? 0).toLocaleString()}
                      </div>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="bg-muted/40 rounded-md px-3 py-2 text-sm">
              <div className="font-medium">
                {selected.productName} · {selected.variantName || "—"}
              </div>
              <div className="text-muted-foreground">{selected.sku}</div>
              <div className="text-muted-foreground mt-1 tabular-nums">
                Available:{" "}
                {(selected.quantityAvailable ?? 0).toLocaleString()} · Avg cost:{" "}
                {(selected.costPrice ?? 0).toLocaleString()}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Quantity out</Label>
              <Input
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                autoFocus
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setSelected(null)}
            >
              Change SKU
            </Button>
          </div>
        )}

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
          <Button type="button" disabled={!selected} onClick={onConfirm}>
            Add line
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
