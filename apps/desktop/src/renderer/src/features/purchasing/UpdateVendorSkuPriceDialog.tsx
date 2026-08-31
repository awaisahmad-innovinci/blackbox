import { useEffect, useState } from "react";
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
  const [sellingPrice, setSellingPrice] = useState(String(currentSellingPrice));
  const [error, setError] = useState<string | null>(null);

  const unitsPer = unitsPerPurchaseUnit > 0 ? unitsPerPurchaseUnit : 1;
  const unitLabel = purchaseUnitName?.trim() || "purchase unit";

  useEffect(() => {
    if (open) {
      setPrice(String(currentPrice));
      setSellingPrice(String(currentSellingPrice));
      setError(null);
    }
  }, [open, currentPrice, currentSellingPrice]);

  function onSave() {
    const next = Number(price);
    const nextSelling = Number(sellingPrice);
    if (Number.isNaN(next) || next < 0) {
      setError("Purchase price must be a non-negative number");
      return;
    }
    if (Number.isNaN(nextSelling) || nextSelling < 0) {
      setError("Sale price must be a non-negative number");
      return;
    }
    const pieceCost = next / unitsPer;
    if (pieceCost > 0 && pieceCost >= nextSelling) {
      setError(
        "Cost per piece must be less than sale price (cost ÷ pieces per purchase unit)",
      );
      return;
    }
    onSaved(next, nextSelling);
    onClose();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="fixed top-1/2 left-1/2 max-w-md -translate-x-1/2 -translate-y-1/2">
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
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Purchase / cost (per {unitLabel})</Label>
            <Input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label>Sale price (per piece)</Label>
            <Input
              value={sellingPrice}
              onChange={(e) => setSellingPrice(e.target.value)}
            />
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
