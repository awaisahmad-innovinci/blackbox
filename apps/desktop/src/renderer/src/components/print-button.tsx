import { Button } from "@blackbox/ui/button";
import { printDocument } from "@renderer/lib/print-document";

type PrintButtonProps = {
  /** When true, send ESC/POS drawer kick after the print dialog (if enabled in settings). */
  openDrawerOnPrint?: boolean;
};

/** ESC/POS drawer kick after a receipt print, if enabled in printer settings. */
export async function openDrawerAfterReceiptPrint(): Promise<void> {
  try {
    const settings = await window.blackbox?.pos?.getPrinterSettings?.();
    if (!settings?.enabled || !settings.openDrawerOnReceiptPrint) {
      return;
    }
    await window.blackbox?.pos?.openCashDrawer?.();
  } catch {
    /* drawer is optional hardware */
  }
}

export function PrintButton({ openDrawerOnPrint = false }: PrintButtonProps) {
  function onPrint() {
    if (openDrawerOnPrint) {
      window.addEventListener(
        "afterprint",
        () => {
          void openDrawerAfterReceiptPrint();
        },
        { once: true },
      );
    }

    void printDocument();
  }

  return (
    <Button
      type="button"
      variant="outline"
      className="no-print"
      onClick={onPrint}
    >
      Print
    </Button>
  );
}
