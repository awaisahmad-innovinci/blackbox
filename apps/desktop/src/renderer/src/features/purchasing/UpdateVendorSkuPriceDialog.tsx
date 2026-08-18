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
import { getApiErrorMessage } from "@renderer/lib/api/client";
import { purchaseOrdersApi } from "@renderer/lib/api/purchase-orders";

export function UpdateVendorSkuPriceDialog({
  open,
  purchaseOrderId,
  purchaseOrderItemId,
  productLabel,
  currentPrice,
  currentSellingPrice,
  onClose,
  onSaved,
}: {
  open: boolean;
  purchaseOrderId: string;
  purchaseOrderItemId: string;
  productLabel: string;
  currentPrice: number;
  currentSellingPrice: number;
  onClose: () => void;
  onSaved: (newPrice: number, newSellingPrice: number) => void;
}) {
  const [price, setPrice] = useState(String(currentPrice));
  const [sellingPrice, setSellingPrice] = useState(String(currentSellingPrice));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setPrice(String(currentPrice));
      setSellingPrice(String(currentSellingPrice));
      setError(null);
    }
  }, [open, currentPrice, currentSellingPrice]);

  async function onSave() {
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
    if (next >= nextSelling) {
      setError("Cost price must be less than sale price");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const purchaseOrder = await purchaseOrdersApi.updateItemPrice(
        purchaseOrderId,
        purchaseOrderItemId,
        {
          unitCost: next,
          sellingPrice: nextSelling,
        },
      );
      try {
        await window.blackbox?.localDb?.upsertPurchaseOrder(purchaseOrder);
      } catch {
        /* optional */
      }
      const savedLine = purchaseOrder.items.find(
        (item) => item.id === purchaseOrderItemId,
      );
      onSaved(savedLine?.unitCost ?? next, nextSelling);
      onClose();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Failed to update SKU price"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !saving) onClose();
      }}
    >
      <DialogContent className="fixed top-1/2 left-1/2 max-w-md -translate-x-1/2 -translate-y-1/2">
        <DialogHeader>
          <DialogTitle>Update SKU Price</DialogTitle>
        </DialogHeader>
        <p className="text-muted-foreground text-sm">{productLabel}</p>
        {error ? (
          <div className="border-destructive/40 bg-destructive/5 text-destructive rounded-md border px-3 py-2 text-sm">
            {error}
          </div>
        ) : null}
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Purchase / cost price</Label>
            <Input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label>Sale price (MRP)</Label>
            <Input
              value={sellingPrice}
              onChange={(e) => setSellingPrice(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={saving}
            onClick={() => void onSave()}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
