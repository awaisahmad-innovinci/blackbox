import { useEffect, useState } from "react";
import type { WarehouseListItem } from "@blackbox/shared";
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
  FormEnterNav,
  formSelectPickerProps,
} from "@renderer/components/form-enter-nav";
import {
  KEYBOARD_HINT_ENTER,
  KEYBOARD_HINT_SAVE,
  KeyboardHints,
} from "@renderer/components/keyboard-hints";
import { getApiErrorMessage } from "@renderer/lib/api/client";
import { skusApi } from "@renderer/lib/api/skus";
import { loadWarehouses } from "@renderer/lib/local-db/entity-source";
import {
  commitLocalChange,
  isDeviceBound,
} from "@renderer/lib/local-db/local-write";
import { handleDialogOpenChange } from "@renderer/lib/on-dialog-open-change";
import { syncNow } from "@renderer/lib/sync/sync-status";
import { usePageKeyboard } from "@renderer/lib/use-page-keyboard";

export function AddCapitalDialog({
  open,
  skuId,
  sku,
  variantName,
  baseUnitName,
  onClose,
  onAdded,
}: {
  open: boolean;
  skuId: string;
  sku: string;
  variantName: string;
  baseUnitName: string | null;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [warehouses, setWarehouses] = useState<WarehouseListItem[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setWarehouseId("");
    setQuantity("");
    setReason("");
    setError(null);
    setSaving(false);
    void loadWarehouses("active")
      .then((rows) => {
        if (cancelled) return;
        setWarehouses(rows);
        if (rows.length === 1) setWarehouseId(rows[0]!.id);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(getApiErrorMessage(err, "Failed to load warehouses"));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const quantityN = Number(quantity);
  const quantityError =
    !quantity.trim() || !Number.isFinite(quantityN) || quantityN <= 0
      ? "Quantity must be greater than zero"
      : null;
  const warehouseError = warehouseId ? null : "Choose a warehouse";
  const canSave =
    Boolean(warehouseId) && !quantityError && !saving && warehouses.length > 0;
  const unitLabel = baseUnitName?.trim() || "base unit";

  function handleOpenChange(next: boolean) {
    handleDialogOpenChange(
      next,
      () => {
        if (!saving) onClose();
      },
      !saving,
    );
  }

  async function onSave() {
    if (!canSave || !warehouseId) return;
    setSaving(true);
    setError(null);
    const note = reason.trim();
    const warehouse = warehouses.find((row) => row.id === warehouseId);
    try {
      if (await isDeviceBound()) {
        const movementId = crypto.randomUUID();
        const now = new Date().toISOString();
        await commitLocalChange({
          entityType: "inventory_movement",
          entityId: movementId,
          operation: "EVENT",
          payload: {
            id: movementId,
            productSkuId: skuId,
            sku,
            variantName,
            warehouseId,
            warehouseName: warehouse?.name ?? "",
            movementType: "OPENING_BALANCE",
            quantity: quantityN,
            delta: quantityN,
            referenceType: "opening_balance",
            referenceId: null,
            reason: note || "Add capital",
            createdAt: now,
          },
        });
        await syncNow();
      } else {
        await skusApi.addOpeningStock(skuId, {
          warehouseId,
          quantity: quantityN,
          ...(note ? { reason: note } : {}),
        });
      }
      onAdded();
      onClose();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Failed to add capital"));
    } finally {
      setSaving(false);
    }
  }

  usePageKeyboard({
    enabled: open,
    onSave: () => {
      if (canSave) void onSave();
    },
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="fixed top-1/2 left-1/2 max-h-[85vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add capital</DialogTitle>
        </DialogHeader>
        <p className="text-muted-foreground text-sm">
          Enter warehouse quantity already on hand. This does not change floor
          stock or the SKU cost. Later purchases still come in through a
          purchase order.
        </p>
        {error ? (
          <div
            role="alert"
            className="border-destructive/40 bg-destructive/5 text-destructive rounded-md border px-3 py-2 text-sm"
          >
            {error}
          </div>
        ) : null}
        <FormEnterNav className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="capital-warehouse">Warehouse</Label>
            <select
              id="capital-warehouse"
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              {...formSelectPickerProps()}
              value={warehouseId}
              aria-invalid={Boolean(warehouseError) && warehouses.length > 0}
              onChange={(e) => setWarehouseId(e.target.value)}
            >
              <option value="">—</option>
              {warehouses.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
            {warehouses.length === 0 ? (
              <p className="text-destructive text-xs">No active warehouse.</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="capital-qty">Quantity ({unitLabel})</Label>
            <Input
              id="capital-qty"
              inputMode="decimal"
              value={quantity}
              aria-invalid={Boolean(quantity.trim()) && Boolean(quantityError)}
              onChange={(e) => setQuantity(e.target.value)}
            />
            {quantity.trim() && quantityError ? (
              <p className="text-destructive text-xs">{quantityError}</p>
            ) : (
              <p className="text-muted-foreground text-xs">
                Added to warehouse on hand. Floor quantity stays the same.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="capital-note">Note</Label>
            <Input
              id="capital-note"
              value={reason}
              maxLength={500}
              placeholder="Optional"
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </FormEnterNav>
        <KeyboardHints hints={[KEYBOARD_HINT_ENTER, KEYBOARD_HINT_SAVE]} />
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => handleOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!canSave}
            onClick={() => void onSave()}
          >
            {saving ? "Adding…" : "Add capital"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
