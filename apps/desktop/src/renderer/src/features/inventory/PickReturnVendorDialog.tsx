import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@blackbox/ui/dialog";
import {
  KEYBOARD_HINT_PICK_ROWS,
  KeyboardHints,
} from "@renderer/components/keyboard-hints";
import { ListPickFocusable, ListPickRow } from "@renderer/components/list-table-row";
import type { VendorReturnScanCandidate } from "@renderer/lib/local-db/entity-source";

export function PickReturnVendorDialog({
  open,
  productName,
  sku,
  candidates,
  warehouseStockAvailable,
  onPick,
  onClose,
}: {
  open: boolean;
  productName: string;
  sku: string;
  candidates: VendorReturnScanCandidate[];
  warehouseStockAvailable?: number | null;
  onPick: (vendorId: string) => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="fixed top-1/2 left-1/2 max-h-[85vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Select vendor for return</DialogTitle>
        </DialogHeader>

        <p className="text-muted-foreground text-sm">
          {productName} · {sku} is linked to multiple vendors. Choose which
          vendor you are returning to.
        </p>
        {warehouseStockAvailable != null ? (
          <p className="text-muted-foreground text-xs">
            Warehouse stock: {warehouseStockAvailable.toLocaleString()} pcs
            (returnable qty may be lower when attributed to a vendor)
          </p>
        ) : null}

        <ul className="border-border max-h-72 divide-y overflow-y-auto rounded-md border">
          {candidates.map((candidate) => {
            const returnable = candidate.row.quantityAvailable ?? 0;
            const unavailable = returnable <= 0;
            return (
              <ListPickRow
                key={candidate.vendorId}
                disabled={unavailable}
                onActivate={() => {
                  if (!unavailable) onPick(candidate.vendorId);
                }}
                className="flex flex-col gap-1 px-3 py-3 text-sm"
              >
                <ListPickFocusable>
                  <span className="font-medium">{candidate.vendorName}</span>
                </ListPickFocusable>
                <span className="flex-1">
                  {unavailable ? (
                    <span className="text-muted-foreground text-xs">
                      Unavailable
                    </span>
                  ) : null}
                  <span className="text-muted-foreground block">
                    {candidate.vendorCode} · Cost{" "}
                    {candidate.row.purchasePrice.toLocaleString()} · Returnable{" "}
                    {returnable.toLocaleString()} pcs
                  </span>
                </span>
              </ListPickRow>
            );
          })}
        </ul>

        <KeyboardHints hints={[KEYBOARD_HINT_PICK_ROWS]} />
      </DialogContent>
    </Dialog>
  );
}
