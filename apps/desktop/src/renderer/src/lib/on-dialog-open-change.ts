import { resetBarcodeWedge } from "@renderer/lib/barcode-scan";
import { releaseStuckModalState } from "@renderer/lib/release-stuck-modal-state";

/** Run after any Radix dialog closes to recover stuck inert/scroll-lock on Windows. */
export function afterDialogClosed(): void {
  releaseStuckModalState({ retry: true });
  resetBarcodeWedge();
}

/** Use when a dialog passes `onClose()` instead of `setOpen`. */
export function handleDialogOpenChange(
  next: boolean,
  onClose: () => void,
  canClose = true,
): void {
  if (next || !canClose) return;
  onClose();
  afterDialogClosed();
}

/** Use with `useState` open flags: `onOpenChange={wrapDialogOpenChange(setOpen)}`. */
export function wrapDialogOpenChange(
  setOpen: (open: boolean) => void,
  options?: { canClose?: () => boolean; onClose?: () => void },
): (next: boolean) => void {
  return (next: boolean) => {
    if (!next && options?.canClose && !options.canClose()) return;
    setOpen(next);
    if (next) return;
    options?.onClose?.();
    afterDialogClosed();
  };
}
