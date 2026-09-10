import { useRef, useState } from "react";
import type { SkuBarcode, SkuBarcodeLookupResult } from "@blackbox/shared";
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
import { skusApi } from "@renderer/lib/api/skus";
import {
  BarcodeAssignRow,
  type BarcodeAssignRowHandle,
} from "@renderer/components/scan-barcode-panel";
import {
  KEYBOARD_HINT_ENTER,
  KEYBOARD_HINT_SAVE,
  KEYBOARD_HINT_SCAN,
  KeyboardHints,
} from "@renderer/components/keyboard-hints";
import { usePageKeyboard } from "@renderer/lib/use-page-keyboard";
import { lookupSkuByBarcode } from "@renderer/lib/local-db/entity-source";
import { commitLocalChange, isDeviceBound } from "@renderer/lib/local-db/local-write";
import { syncNow } from "@renderer/lib/sync/sync-status";

function duplicateBarcodeMessage(row: SkuBarcodeLookupResult): string {
  return `This barcode already exists on ${row.productName} (${row.sku})`;
}

export function AddSkuBarcodeDialog({
  open,
  skuId,
  unitsPerPurchaseUnit = 1,
  onClose,
  onAdded,
}: {
  open: boolean;
  skuId: string;
  unitsPerPurchaseUnit?: number;
  onClose: () => void;
  onAdded: (row: SkuBarcode) => void;
}) {
  const [barcode, setBarcode] = useState("");
  const [quantityMultiplier, setQuantityMultiplier] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const barcodeRowRef = useRef<BarcodeAssignRowHandle>(null);

  function reset() {
    setBarcode("");
    setQuantityMultiplier("1");
    setError(null);
    setSaving(false);
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      reset();
      onClose();
    }
  }

  const multiplierN = Number(quantityMultiplier);
  const multiplierError =
    !quantityMultiplier.trim() || Number.isNaN(multiplierN) || multiplierN <= 0
      ? "Qty per scan must be greater than zero"
      : null;
  const canSave = Boolean(barcode.trim()) && !multiplierError && !saving;

  async function onSave() {
    const code = barcode.trim();
    if (!code || !canSave) return;
    setSaving(true);
    setError(null);
    try {
      const dup = await lookupSkuByBarcode(code);
      if (dup && dup.id !== skuId) {
        setError(duplicateBarcodeMessage(dup));
        setSaving(false);
        return;
      }
      if (await isDeviceBound()) {
        const id = crypto.randomUUID();
        const row: SkuBarcode = {
          id,
          productSkuId: skuId,
          barcode: code,
          status: "active",
          quantityMultiplier: multiplierN,
        };
        await commitLocalChange({
          entityType: "product_sku_barcode",
          entityId: id,
          operation: "UPSERT",
          payload: row as unknown as Record<string, unknown>,
        });
        void syncNow();
        reset();
        onAdded(row);
        onClose();
        return;
      }
      const row = await skusApi.addBarcode(skuId, {
        barcode: code,
        quantityMultiplier: multiplierN,
      });
      try {
        await window.blackbox?.localDb?.upsertSkuBarcode?.(row);
      } catch {
        /* optional cache */
      }
      reset();
      onAdded(row);
      onClose();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Failed to add barcode"));
    } finally {
      setSaving(false);
    }
  }

  usePageKeyboard({
    enabled: open,
    onSave: () => {
      if (canSave) void onSave();
    },
    onScan: () => barcodeRowRef.current?.openScan(),
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="fixed top-1/2 left-1/2 max-h-[85vh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add barcode</DialogTitle>
        </DialogHeader>
        {error ? (
          <div className="border-destructive/40 bg-destructive/5 text-destructive rounded-md border px-3 py-2 text-sm">
            {error}
          </div>
        ) : null}
        <BarcodeAssignRow
          ref={barcodeRowRef}
          value={barcode}
          layer="dialog"
          onApply={(code) => setBarcode(code.trim())}
        />
        <div className="space-y-1.5">
          <Label htmlFor="qty-per-scan">Qty per scan</Label>
          <Input
            id="qty-per-scan"
            value={quantityMultiplier}
            aria-invalid={Boolean(multiplierError)}
            onChange={(e) => setQuantityMultiplier(e.target.value)}
          />
          {multiplierError ? (
            <p className="text-destructive text-xs">{multiplierError}</p>
          ) : unitsPerPurchaseUnit > 1 ? (
            <p className="text-muted-foreground text-xs">
              Use 1 for piece barcode, {unitsPerPurchaseUnit} for box barcode.
            </p>
          ) : (
            <p className="text-muted-foreground text-xs">
              Base units added per scan (default 1).
            </p>
          )}
        </div>
        <KeyboardHints
          hints={[KEYBOARD_HINT_ENTER, KEYBOARD_HINT_SCAN, KEYBOARD_HINT_SAVE]}
        />
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => handleOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" disabled={!canSave} onClick={() => void onSave()}>
            {saving ? "Adding…" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
