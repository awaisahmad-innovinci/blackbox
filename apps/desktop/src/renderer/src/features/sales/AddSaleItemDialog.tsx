import { useEffect, useRef, useState } from "react";
import { formatMoney } from "@blackbox/shared";
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
  mode = "sale",
}: {
  open: boolean;
  warehouseId: string;
  excludeDraftSaleId?: string | null;
  onClose: () => void;
  onAddMany: (rows: SkuSearchResult[]) => void;
  /** "foc": items are added free of cost (qty 0, FOC 1), not billed. */
  mode?: "sale" | "foc";
}) {
  const isFocMode = mode === "foc";
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SkuSearchResult[]>([]);
  const [resultsQuery, setResultsQuery] = useState("");
  const [posBalanceBySkuId, setPosBalanceBySkuId] = useState<Map<string, number>>(
    new Map(),
  );
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const queryRef = useRef<HTMLInputElement>(null);
  const confirmingRef = useRef(false);
  const searchEnterRef = useRef(false);

  useBarcodeScanTarget({
    kind: "search",
    layer: "dialog",
    enabled: open,
    inputRef: queryRef,
    onScan: setQuery,
  });

  useEffect(() => {
    if (!open || !warehouseId) return;
    const requested = query;
    const t = setTimeout(() => {
      void loadSkuSearch(requested, warehouseId)
        .then((rows) => {
          setResults(rows);
          setResultsQuery(requested);
        })
        .catch(() => {
          setResults([]);
          setResultsQuery(requested);
        });
    }, 200);
    return () => clearTimeout(t);
  }, [query, open, warehouseId]);

  useEffect(() => {
    const q = query.trim();
    if (!q || resultsQuery !== q || results.length !== 1) return;
    const row = results[0];
    if (!row || !posBalanceBySkuId.has(row.id)) return;
    const qty = posBalanceBySkuId.get(row.id) ?? 0;
    if (qty <= 0) {
      setSelectedIds((prev) => (prev.length === 0 ? prev : []));
      return;
    }
    setSelectedIds((prev) =>
      prev.length === 1 && prev[0] === row.id ? prev : [row.id],
    );
  }, [query, resultsQuery, results, posBalanceBySkuId]);

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
        // #region agent log
        const withQty = entries.filter(([, qty]) => qty > 0).length;
        fetch("http://127.0.0.1:7686/ingest/ab68d8f7-59f7-4472-9baa-3354161bb732",{method:"POST",headers:{"Content-Type":"application/json","X-Debug-Session-Id":"abae79"},body:JSON.stringify({sessionId:"abae79",runId:"run1",hypothesisId:"E",location:"AddSaleItemDialog.tsx:balances",message:"pos lookup",data:{warehouseId,checked:entries.length,withQty},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, warehouseId, results, excludeDraftSaleId]);

  function reset() {
    setQuery("");
    setResults([]);
    setResultsQuery("");
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

  async function commitRows(chosen: SkuSearchResult[]) {
    if (chosen.length === 0 || confirmingRef.current) return;
    confirmingRef.current = true;
    setConfirming(true);
    try {
      const rows = await Promise.all(
        chosen.map(async (row) => {
          const qty =
            posBalanceBySkuId.get(row.id) ?? row.quantityAvailable;
          const profile = await loadSkuProfile(row.id);
          return {
            ...row,
            quantityAvailable: qty,
            sellingPrice: profile.sku.sellingPrice,
            sellingPricePerPurchaseUnit: profile.sku.sellingPricePerPurchaseUnit,
            unitsPerPurchaseUnit: profile.sku.unitsPerPurchaseUnit,
            costPrice: profile.sku.costPrice,
            gstPercent: profile.sku.gstPercent,
            saleDiscountPercent: profile.sku.saleDiscountPercent,
            hsCode: profile.sku.hsCode,
          } satisfies SkuSearchResult;
        }),
      );
      onAddMany(rows);
      reset();
      onClose();
    } finally {
      confirmingRef.current = false;
      setConfirming(false);
    }
  }

  async function onConfirm() {
    const chosen = results.filter(
      (r) => selectedIds.includes(r.id) && !isUnavailable(r),
    );
    await commitRows(chosen);
  }

  async function addExactSearchHit(searchText: string) {
    const q = searchText.trim();
    if (!q || confirmingRef.current || searchEnterRef.current) return;
    searchEnterRef.current = true;
    try {
      let rows = results;
      if (resultsQuery !== q) {
        try {
          rows = await loadSkuSearch(q, warehouseId);
        } catch {
          rows = [];
        }
        setResults(rows);
        setResultsQuery(q);
      }
      if (rows.length !== 1) return;
      const row = rows[0];
      if (!row) return;
      let qty = posBalanceBySkuId.get(row.id);
      if (qty == null) {
        qty = await loadPosAvailableForSale(
          warehouseId,
          row.id,
          excludeDraftSaleId,
        );
      }
      if (qty <= 0) return;
      setSelectedIds([row.id]);
      await commitRows([{ ...row, quantityAvailable: qty }]);
    } finally {
      searchEnterRef.current = false;
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
          <DialogTitle>{isFocMode ? "Add FOC items" : "Add items"}</DialogTitle>
        </DialogHeader>

        <p className="text-muted-foreground text-sm">
          {isFocMode
            ? "Items are given free; nothing is added to the bill total, but FOC qty is deducted from POS floor stock. Only items with POS floor balance can be given."
            : "Search by product name, SKU code, or barcode. Only items with POS floor balance can be sold."}
        </p>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Search product / SKU</Label>
            <Input
              ref={queryRef}
              {...barcodeScanInputProps()}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                void addExactSearchHit(event.currentTarget.value);
              }}
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
                            ? ` · Price ${formatMoney((r.sellingPrice ?? 0))}`
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
              : isFocMode
                ? selectedIds.length > 1
                  ? `Add ${selectedIds.length} as FOC`
                  : "Add as FOC"
                : selectedIds.length > 1
                  ? `Add ${selectedIds.length} items`
                  : "Add item"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
