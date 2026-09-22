import { Button } from "@blackbox/ui/button";

type PrintButtonProps = {
  /** When true, send ESC/POS drawer kick after the print dialog (if enabled in settings). */
  openDrawerOnPrint?: boolean;
};

export function PrintButton({ openDrawerOnPrint = false }: PrintButtonProps) {
  function onPrint() {
    if (openDrawerOnPrint) {
      window.addEventListener(
        "afterprint",
        () => {
          void (async () => {
            try {
              const settings =
                await window.blackbox?.pos?.getPrinterSettings?.();
              if (
                !settings?.enabled ||
                !settings.openDrawerOnReceiptPrint
              ) {
                return;
              }
              await window.blackbox?.pos?.openCashDrawer?.();
            } catch {
              /* drawer is optional hardware */
            }
          })();
        },
        { once: true },
      );
    }

    window.print();
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
