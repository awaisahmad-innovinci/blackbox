import { Button } from "@blackbox/ui/button";

export function PrintButton() {
  return (
    <Button
      type="button"
      variant="outline"
      className="no-print"
      onClick={() => window.print()}
    >
      Print
    </Button>
  );
}
