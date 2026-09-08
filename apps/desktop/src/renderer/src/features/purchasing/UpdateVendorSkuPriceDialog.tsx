import { useEffect, useMemo, useState } from "react";
import { FORM_GRID_TIGHT } from "@renderer/lib/form-layout";
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
  optionalNonNegativeMargin,
  pieceCostFromPurchase,
  sellingFromPurchaseMargin,
  sellingGreaterThanCost,
} from "@renderer/lib/sku-pricing";

const SALE_GT_PIECE_COST =
  "Sale price must be greater than cost per piece";

export function UpdateVendorSkuPriceDialog({
  open,
  productLabel,
  currentPrice,
  currentSellingPrice,
  purchaseUnitName,
  unitsPerPurchaseUnit,
  onClose,
  onSaved,
}: {
  open: boolean;
  productLabel: string;
  currentPrice: number;
  currentSellingPrice: number;
  purchaseUnitName: string | null;
  unitsPerPurchaseUnit: number;
  onClose: () => void;
  onSaved: (newPrice: number, newSellingPrice: number) => void;
}) {
  const [price, setPrice] = useState(String(currentPrice));
  const [marginPercent, setMarginPercent] = useState("");
  const [sellingPrice, setSellingPrice] = useState(String(currentSellingPrice));
  const [error, setError] = useState<string | null>(null);

  const unitsPer = unitsPerPurchaseUnit > 0 ? unitsPerPurchaseUnit : 1;
  const unitLabel = purchaseUnitName?.trim() || "purchase unit";

  const pieceCost = useMemo(() => {
    const purchaseN = Number(price);
    if (!price.trim() || Number.isNaN(purchaseN) || purchaseN < 0) return null;
    return pieceCostFromPurchase(purchaseN, unitsPer);
  }, [price, unitsPer]);

  useEffect(() => {
    if (open) {
      setPrice(String(currentPrice));
      setMarginPercent("");
      setSellingPrice(String(currentSellingPrice));
      setError(null);
    }
  }, [open, currentPrice, currentSellingPrice]);

  function applySaleFromMargin(nextPrice: string, nextMargin: string) {
    const calculated = sellingFromPurchaseMargin(nextPrice, nextMargin, unitsPer);
    if (calculated != null) setSellingPrice(calculated);
  }

  function onPurchasePriceChange(value: string) {
    setPrice(value);
    applySaleFromMargin(value, marginPercent);
  }

  function onMarginPercentChange(value: string) {
    setMarginPercent(value);
    applySaleFromMargin(price, value);
  }

  function onSave() {
    const next = Number(price);
    const nextSelling = Number(sellingPrice);
    if (Number.isNaN(next) || next < 0) {
      setError("Purchase price must be a non-negative number");
      return;
    }
    const marginError = optionalNonNegativeMargin(marginPercent);
    if (marginError) {
      setError(marginError);
      return;
    }
    if (Number.isNaN(nextSelling) || nextSelling < 0) {
      setError("Sale price must be a non-negative number");
      return;
    }
    const costPerPiece = pieceCostFromPurchase(next, unitsPer);
    const saleError = sellingGreaterThanCost(
      String(costPerPiece),
      String(nextSelling),
      SALE_GT_PIECE_COST,
    );
    if (saleError) {
      setError(saleError);
      return;
    }
    onSaved(next, nextSelling);
    onClose();
  }

  const marginError = optionalNonNegativeMargin(marginPercent);
  const saleError =
    pieceCost != null
      ? sellingGreaterThanCost(String(pieceCost), sellingPrice, SALE_GT_PIECE_COST)
      : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="fixed top-1/2 left-1/2 max-h-[85vh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Update SKU Price</DialogTitle>
        </DialogHeader>
        <p className="text-muted-foreground text-sm">{productLabel}</p>
        {unitsPer > 1 ? (
          <p className="text-muted-foreground text-xs">
            1 {unitLabel} = {unitsPer} pcs
          </p>
        ) : null}
        {error ? (
          <div className="border-destructive/40 bg-destructive/5 text-destructive rounded-md border px-3 py-2 text-sm">
            {error}
          </div>
        ) : null}
        <div className={FORM_GRID_TIGHT}>
          <div className="space-y-1.5">
            <Label>Purchase / cost (per {unitLabel})</Label>
            <Input
              value={price}
              onChange={(e) => onPurchasePriceChange(e.target.value)}
              autoFocus
            />
            {pieceCost != null && unitsPer > 1 ? (
              <p className="text-muted-foreground text-xs">
                Cost per piece: {pieceCost}
              </p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label>Margin %</Label>
            <Input
              value={marginPercent}
              aria-invalid={Boolean(marginError)}
              placeholder="Optional — auto-fills sale price"
              onChange={(e) => onMarginPercentChange(e.target.value)}
            />
            {marginError ? (
              <p className="text-destructive text-xs">{marginError}</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label>Sale price (per piece)</Label>
            <Input
              value={sellingPrice}
              aria-invalid={Boolean(saleError)}
              onChange={(e) => setSellingPrice(e.target.value)}
            />
            {saleError ? (
              <p className="text-destructive text-xs">{saleError}</p>
            ) : null}
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={onSave}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
