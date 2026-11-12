import { Button } from "@blackbox/ui/button";
import { formatMoney } from "@blackbox/shared";
import { PrintButton } from "@renderer/components/print-button";
import { PrintDocument } from "@renderer/components/print-document";

export type VendorPaymentReceiptData = {
  vendorName: string;
  amount: number;
  note: string;
  occurredAt: string;
  paidBy: string;
  /** Credit still owed after this payment. Omitted on a later reprint. */
  creditRemaining?: number;
};

export function VendorPaymentReceipt({
  receipt,
  onDone,
}: {
  receipt: VendorPaymentReceiptData;
  onDone: () => void;
}) {
  const when = new Date(receipt.occurredAt).toLocaleString();
  return (
    <PrintDocument>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Vendor payment receipt
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">{when}</p>
        </div>
        <div className="no-print flex gap-2">
          <PrintButton />
          <Button type="button" variant="ghost" onClick={onDone}>
            Done
          </Button>
        </div>
      </div>

      <section className="space-y-3 text-sm">
        <div className="flex justify-between gap-6">
          <span className="text-muted-foreground">Vendor</span>
          <span className="font-medium">{receipt.vendorName || "Vendor"}</span>
        </div>
        <div className="flex justify-between gap-6">
          <span className="text-muted-foreground">Amount paid</span>
          <span className="tabular-nums font-medium">
            {formatMoney(receipt.amount)}
          </span>
        </div>
        {receipt.note ? (
          <div className="flex justify-between gap-6">
            <span className="text-muted-foreground">Note</span>
            <span>{receipt.note}</span>
          </div>
        ) : null}
        {receipt.creditRemaining != null ? (
          <div className="flex justify-between gap-6">
            <span className="text-muted-foreground">Credit still owed</span>
            <span className="tabular-nums">
              {formatMoney(receipt.creditRemaining)}
            </span>
          </div>
        ) : null}
        {receipt.paidBy ? (
          <div className="flex justify-between gap-6">
            <span className="text-muted-foreground">Paid by</span>
            <span>{receipt.paidBy}</span>
          </div>
        ) : null}
      </section>

      <section className="space-y-8 pt-6 text-sm">
        <p className="font-medium">Received by</p>
        <div className="space-y-1">
          <div className="border-foreground w-56 border-b" />
          <p className="text-muted-foreground">Name</p>
        </div>
        <div className="space-y-1">
          <div className="border-foreground h-10 w-56 border-b" />
          <p className="text-muted-foreground">Signature</p>
        </div>
      </section>
    </PrintDocument>
  );
}
