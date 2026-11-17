import { useEffect, useState } from "react";
import QRCode from "qrcode";
import type { SaleDetail, SalePaymentMethod } from "@blackbox/shared";
import {
  THERMAL_RECEIPT_CLASS,
  ThermalMetaRow,
  ThermalReceiptBarcode,
  ThermalReceiptHeader,
  ThermalRule,
  ThermalSaleLineItems,
  ThermalTotalsRow,
  formatMoney,
  formatReceiptDateTime,
} from "./thermal-receipt-shared";

function FbrInvoiceQr({ value }: { value: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void QRCode.toDataURL(value, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 160,
    })
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setSrc(null);
      });
    return () => {
      cancelled = true;
    };
  }, [value]);
  if (!src) return null;
  return (
    <img
      src={src}
      alt="FBR invoice QR"
      className="h-[16mm] w-[16mm]"
    />
  );
}

function paymentMethodLabel(method: SalePaymentMethod): string {
  if (method === "CASH") return "Cash";
  if (method === "CARD") return "Card";
  return "Credit";
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export type SaleReturnCreditReceipt = {
  returnNumber: string;
  amount: number;
  cashBack?: number;
};

export function SaleThermalReceipt({
  detail,
  businessName,
  businessAddress,
  businessPhone,
  cashierName,
  returnCredit,
  fbrEnabled = false,
}: {
  detail: SaleDetail;
  businessName: string;
  businessAddress?: string;
  businessPhone?: string;
  cashierName: string;
  returnCredit?: SaleReturnCreditReceipt;
  fbrEnabled?: boolean;
}) {
  const totalItems = detail.items.length;
  const totalQty = detail.items.reduce((sum, item) => sum + item.quantity, 0);
  const totalFoc = detail.items.reduce(
    (sum, item) => sum + (item.focQuantity ?? 0),
    0,
  );
  const totalQtyInclFoc = detail.items.reduce(
    (sum, item) => sum + item.quantity + (item.focQuantity ?? 0),
    0,
  );
  const hasFoc = totalFoc > 0;
  const { date, time } = formatReceiptDateTime(detail.postedAt);
  const creditAmount = returnCredit?.amount ?? 0;
  const netAmount = round4(Math.max(0, detail.total - creditAmount));
  const cashBackFromCredit =
    returnCredit?.cashBack ?? round4(Math.max(0, creditAmount - detail.total));
  const amountDue = netAmount;
  const hasCashOverpay =
    detail.cashTendered != null && detail.cashTendered > amountDue;
  const cashChange = hasCashOverpay
    ? round4(detail.cashTendered! - amountDue)
    : 0;
  const showFbrNumber = Boolean(detail.fbrInvoiceNumber);
  const showFbrError =
    fbrEnabled &&
    !showFbrNumber &&
    detail.fbrStatus === "failed" &&
    Boolean(detail.fbrError);

  return (
    <article data-thermal-receipt className={THERMAL_RECEIPT_CLASS}>
      <ThermalReceiptHeader
        businessName={businessName}
        businessAddress={businessAddress}
        businessPhone={businessPhone}
        ntn={detail.fbrSellerNtn}
      />

      <ThermalRule />

      <p className="text-center text-sm font-bold tracking-wide">SALES INVOICE</p>

      <section className="space-y-0.5 text-left">
        <ThermalMetaRow label="Bill #" value={detail.saleNumber} />
        <ThermalMetaRow label="Date" value={date} />
        <ThermalMetaRow label="Time" value={time} />
        <ThermalMetaRow label="Cashier" value={cashierName} />
        <ThermalMetaRow label="Customer" value={detail.customerName} />
        {detail.status === "VOID" ? (
          <p className="pt-0.5 text-center text-sm font-bold">*** VOID ***</p>
        ) : null}
      </section>

      <ThermalReceiptBarcode value={detail.saleNumber} />

      <ThermalRule />

      <ThermalSaleLineItems items={detail.items} />

      <ThermalRule />

      <section className="space-y-0.5">
        <ThermalTotalsRow label="Total items" value={totalItems} />
        <ThermalTotalsRow label="Total qty" value={totalQty} />
        {hasFoc ? (
          <>
            <ThermalTotalsRow label="Total FOC" value={totalFoc} />
            <ThermalTotalsRow label="Qty incl. FOC" value={totalQtyInclFoc} />
          </>
        ) : null}
        <ThermalTotalsRow
          label="Subtotal"
          value={formatMoney(detail.subtotal)}
        />
        {detail.gstAmount > 0 ? (
          <ThermalTotalsRow label="GST" value={formatMoney(detail.gstAmount)} />
        ) : null}
        {detail.salesTaxAmount > 0 ? (
          <ThermalTotalsRow
            label={`Sales tax (${detail.salesTaxRate}%)`}
            value={formatMoney(detail.salesTaxAmount)}
          />
        ) : null}
        <ThermalRule />
        <ThermalTotalsRow
          label="BILL TOTAL"
          value={formatMoney(detail.total)}
          bold
        />
        {returnCredit ? (
          <ThermalTotalsRow
            label={`Return credit (${returnCredit.returnNumber})`}
            value={`−${formatMoney(returnCredit.amount)}`}
          />
        ) : null}
        {returnCredit && cashBackFromCredit > 0 ? (
          <ThermalTotalsRow
            label="Cash back"
            value={formatMoney(cashBackFromCredit)}
          />
        ) : null}
        {hasCashOverpay ? (
          <>
            <ThermalTotalsRow
              label="Paid"
              value={formatMoney(detail.cashTendered!)}
            />
            <ThermalTotalsRow label="Change" value={formatMoney(cashChange)} />
          </>
        ) : null}
        <ThermalTotalsRow label="Net amount" value={formatMoney(netAmount)} />
        {detail.payments.map((payment) => (
          <ThermalTotalsRow
            key={payment.id}
            label={paymentMethodLabel(payment.method)}
            value={formatMoney(payment.amount)}
          />
        ))}
      </section>

      {showFbrNumber || showFbrError ? (
        <>
          <ThermalRule />
          <section>
            {showFbrNumber && detail.fbrInvoiceNumber ? (
              <div className="flex items-center gap-2 text-left">
                <div className="flex h-[18mm] w-[18mm] shrink-0 items-center justify-center border border-dashed border-black">
                  <FbrInvoiceQr value={detail.fbrInvoiceNumber} />
                </div>
                <div className="min-w-0 text-[10px] leading-tight">
                  <p className="font-bold">FBR Invoice #</p>
                  <p className="font-semibold break-all">
                    {detail.fbrInvoiceNumber}
                  </p>
                  <p>Scan to verify with FBR</p>
                </div>
              </div>
            ) : (
              <p className="text-center text-xs font-bold">{detail.fbrError}</p>
            )}
          </section>
        </>
      ) : null}

      <ThermalRule />

      <section className="pt-0.5 text-left text-[9px] leading-tight">
        <p className="mb-0.5 text-center font-bold">RETURN &amp; EXCHANGE POLICY</p>
        <ol className="list-decimal pl-4 text-left">
          <li>Items can only be exchanged within 7 days of purchase.</li>
          <li>Original receipt must be presented for exchange.</li>
          <li>Products sold under offer/discount/promotion cannot be exchanged.</li>
        </ol>
      </section>

      <ThermalRule />

      <section className="pt-0.5 text-center text-[10px] leading-tight">
        <p className="font-bold">Thanks for visiting us</p>
        <p className="mt-0.5 font-bold">No Bill No Return</p>
      </section>

      <footer className="pt-1 text-center text-[9px] leading-tight font-semibold">
        <p>This software design &amp; developed by</p>
        <p>Innovinci Technologies · www.innovinci.com</p>
      </footer>

      <div className="thermal-receipt-feed" aria-hidden="true" />
    </article>
  );
}
