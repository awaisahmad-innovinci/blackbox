import { flushSync } from "react-dom";
import { Button } from "@blackbox/ui/button";

async function kickDrawerIfEnabled(): Promise<void> {
  try {
    const settings = await window.blackbox?.pos?.getPrinterSettings?.();
    if (!settings?.enabled || !settings.openDrawerOnReceiptPrint) return;
    await window.blackbox?.pos?.openCashDrawer?.();
  } catch {
    /* drawer is optional hardware */
  }
}

/**
 * Prints the receipt on screen. Uses silent printing to the saved printer when
 * "Print receipts without the print dialog" is on (review U9); otherwise, or if silent
 * printing fails, opens the normal print dialog. Optionally opens the cash drawer after.
 */
export async function printReceipt(options?: {
  openDrawer?: boolean;
  onAfterPrint?: () => void;
}): Promise<void> {
  const after = () => {
    options?.onAfterPrint?.();
    if (options?.openDrawer) void kickDrawerIfEnabled();
  };

  try {
    const settings = await window.blackbox?.pos?.getPrinterSettings?.();
    if (settings?.enabled && settings.silentReceiptPrint && window.blackbox?.pos?.printSilently) {
      const result = await window.blackbox.pos.printSilently();
      if (result.ok) {
        after();
        return;
      }
    }
  } catch {
    /* fall back to the dialog */
  }

  window.addEventListener("afterprint", after, { once: true });
  window.print();
}

type PrintButtonProps = {
  /** When true, open the cash drawer after printing (if enabled in settings). */
  openDrawerOnPrint?: boolean;
  /** Runs synchronously before printing (e.g. to mark the copy as DUPLICATE). */
  onBeforePrint?: () => void;
  /** Runs after printing finishes. */
  onAfterPrint?: () => void;
  label?: string;
};

export function PrintButton({
  openDrawerOnPrint = false,
  onBeforePrint,
  onAfterPrint,
  label = "Print",
}: PrintButtonProps) {
  function onPrint() {
    if (onBeforePrint) flushSync(onBeforePrint);
    void printReceipt({ openDrawer: openDrawerOnPrint, onAfterPrint });
  }

  return (
    <Button
      type="button"
      variant="outline"
      className="no-print"
      onClick={onPrint}
    >
      {label}
    </Button>
  );
}
