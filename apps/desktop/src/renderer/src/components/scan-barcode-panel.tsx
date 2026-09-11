import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
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
  barcodeScanInputProps,
  resetBarcodeWedge,
  useBarcodeScanTarget,
  type BarcodeScanLayer,
} from "@renderer/lib/barcode-scan";
import {
  focusFormSelect,
  hasFocusTarget,
} from "@renderer/lib/focus-form-select";

export function ScanBarcodePanel({
  open,
  onOpenChange,
  title = "Scan barcode",
  description = "Scan or type a barcode, then press Enter.",
  busy = false,
  layer = "dialog",
  initialValue = "",
  allowEmpty = false,
  confirmLabel = "OK",
  clearAfterComplete = false,
  closeAfterComplete = false,
  returnFocusTo,
  onComplete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  busy?: boolean;
  layer?: BarcodeScanLayer;
  initialValue?: string;
  allowEmpty?: boolean;
  confirmLabel?: string;
  clearAfterComplete?: boolean;
  closeAfterComplete?: boolean;
  returnFocusTo?: string;
  onComplete: (code: string) => void | Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (!open) {
      resetBarcodeWedge();
      return;
    }
    setDraft(initialValue);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [open, initialValue]);

  function handleOpenChange(next: boolean): void {
    if (!next) resetBarcodeWedge();
    onOpenChange(next);
  }

  async function handleComplete(code: string) {
    if (busy) return;
    const trimmed = code.trim();
    if (!trimmed && !allowEmpty) return;
    await onComplete(trimmed);
    if (clearAfterComplete) {
      setDraft("");
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
    if (closeAfterComplete) {
      handleOpenChange(false);
      if (returnFocusTo && hasFocusTarget(returnFocusTo)) {
        focusFormSelect(returnFocusTo);
      }
    }
  }

  useBarcodeScanTarget({
    kind: "barcode",
    layer,
    enabled: open,
    inputRef,
    onScan: setDraft,
    onComplete: (code) => {
      void handleComplete(code);
    },
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="fixed top-1/2 left-1/2 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2"
        onCloseAutoFocus={(event) => {
          if (returnFocusTo && hasFocusTarget(returnFocusTo)) {
            event.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <p className="text-muted-foreground text-sm">{description}</p>
          <Input
            ref={inputRef}
            {...barcodeScanInputProps()}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              e.stopPropagation();
              void handleComplete(draft);
            }}
            placeholder="Scan or type barcode"
            autoComplete="off"
            disabled={busy}
          />
          {busy ? (
            <p className="text-muted-foreground text-xs">Looking up…</p>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => handleOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={busy || (!allowEmpty && !draft.trim())}
            onClick={() => void handleComplete(draft)}
          >
            {busy ? "Working…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type BarcodeAssignRowHandle = {
  openScan: () => void;
};

export const BarcodeAssignRow = forwardRef<
  BarcodeAssignRowHandle,
  {
    value: string;
    checking?: boolean;
    onApply: (code: string) => void | Promise<void>;
    layer?: BarcodeScanLayer;
    buttonLabel?: "default" | "short";
    returnFocusTo?: string;
  }
>(function BarcodeAssignRow(
  {
    value,
    checking = false,
    onApply,
    layer = "dialog",
    buttonLabel = "default",
    returnFocusTo,
  },
  ref,
) {
  const [scanOpen, setScanOpen] = useState(false);
  const hasBarcode = Boolean(value.trim());
  const actionLabel =
    buttonLabel === "short"
      ? hasBarcode
        ? "Change"
        : "Scan"
      : hasBarcode
        ? "Change barcode"
        : "Scan barcode";

  useImperativeHandle(ref, () => ({
    openScan: () => setScanOpen(true),
  }));

  return (
    <div className="space-y-1.5">
      <Label>Barcode</Label>
      <div className="flex items-center gap-2">
        <div className="border-input bg-background flex h-9 min-w-0 flex-1 basis-0 items-center truncate rounded-md border px-3 text-sm font-medium tabular-nums">
          {value.trim() || "—"}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 shrink-0 whitespace-nowrap"
          disabled={checking}
          onClick={() => setScanOpen(true)}
        >
          {actionLabel}
        </Button>
      </div>
      {checking ? (
        <p className="text-muted-foreground text-xs">Checking barcode…</p>
      ) : null}
      <ScanBarcodePanel
        open={scanOpen}
        onOpenChange={setScanOpen}
        layer={layer}
        busy={checking}
        initialValue={value}
        allowEmpty
        confirmLabel="OK"
        closeAfterComplete
        returnFocusTo={returnFocusTo}
        description="Scan, type, then press Enter or OK. Leave empty and OK to clear."
        onComplete={onApply}
      />
    </div>
  );
});
