import { useEffect, useRef, useState } from "react";
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
  parseNumericInputChange,
  replaceLeadingZeroOnKeyDown,
  selectZeroNumericOnFocus,
} from "@renderer/lib/select-zero-numeric-on-focus";

export type AdjustSaleQtyLine = {
  productSkuId: string;
  productName: string;
  variantName: string;
  sku: string;
  quantity: number;
  focQuantity: number;
  quantityAvailable: number;
  quantityCorrected?: boolean;
};

type AdjustSaleQtyDialogProps = {
  open: boolean;
  line: AdjustSaleQtyLine | null;
  busy?: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (newQuantity: number) => Promise<void>;
};

export function AdjustSaleQtyDialog({
  open,
  line,
  busy = false,
  onOpenChange,
  onApply,
}: AdjustSaleQtyDialogProps) {
  const [newQtyRaw, setNewQtyRaw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || !line) return;
    setNewQtyRaw("");
    setError(null);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [open, line]);

  async function onConfirm() {
    if (!line || busy) return;

    if (line.quantityCorrected) {
      setError("Quantity already corrected for this item");
      return;
    }

    const newQuantity = round4(parseNumericInputChange(newQtyRaw));
    if (!Number.isFinite(newQuantity) || newQuantity <= 0) {
      setError("Enter a quantity greater than zero");
      return;
    }
    if (newQuantity >= line.quantity) {
      setError("New quantity must be less than the current quantity");
      return;
    }
    if (round4(newQuantity + line.focQuantity) > line.quantityAvailable) {
      setError(
        `Cannot exceed POS balance (${line.quantityAvailable}) for ${line.sku}`,
      );
      return;
    }

    setError(null);
    await onApply(newQuantity);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust quantity</DialogTitle>
        </DialogHeader>

        {line ? (
          <div className="space-y-4">
            <div className="text-sm">
              <p className="font-medium">
                {line.productName}
                {line.variantName ? ` · ${line.variantName}` : ""}
              </p>
              <p className="text-muted-foreground text-xs">{line.sku}</p>
              <p className="text-muted-foreground mt-2 text-xs">
                Current qty: {line.quantity.toLocaleString()}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="adjustSaleQty">New quantity</Label>
              <Input
                id="adjustSaleQty"
                ref={inputRef}
                type="number"
                min={0}
                step="any"
                value={newQtyRaw}
                onFocus={selectZeroNumericOnFocus}
                onKeyDown={(event) => {
                  replaceLeadingZeroOnKeyDown(event);
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void onConfirm();
                  }
                }}
                onChange={(event) => setNewQtyRaw(event.target.value)}
                disabled={busy}
              />
              <p className="text-muted-foreground text-xs">
                Decrease only. Manager approval required. One correction per
                item on this bill.
              </p>
            </div>
          </div>
        ) : null}

        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={busy || !line}
            onClick={() => void onConfirm()}
          >
            {busy ? "Applying…" : "Apply correction"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
