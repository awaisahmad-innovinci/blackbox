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
  ThermalTitle,
  ThermalTotalsRow,
  formatReceiptDateTime,
  receiptMoney,
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
      className="block h-[22mm] w-[22mm]"
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
  duplicate = false,
}: {
  detail: SaleDetail;
  businessName: string;
  businessAddress?: string;
  businessPhone?: string;
  cashierName: string;
  returnCredit?: SaleReturnCreditReceipt;
  fbrEnabled?: boolean;
  /** Reprint copy: marked DUPLICATE so it cannot pass as a second original (BR-005). */
  duplicate?: boolean;
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
  const nonCashPayments = detail.payments.filter(
    (payment) => payment.method !== "CASH",
  );
  const showAllPayments = detail.payments.length > 1;
  const showFbrNumber = Boolean(detail.fbrInvoiceNumber);
  const showFbrError =
    fbrEnabled &&
    !showFbrNumber &&
    detail.fbrStatus === "failed" &&
    Boolean(detail.fbrError);

  const money = receiptMoney;
  const paymentRows = showAllPayments ? detail.payments : nonCashPayments;

  return (
    <article data-thermal-receipt className={THERMAL_RECEIPT_CLASS}>
      <ThermalReceiptHeader
        businessName={businessName}
        businessAddress={businessAddress}
        businessPhone={businessPhone}
        ntn={detail.fbrSellerNtn}
      />

      <ThermalTitle>SALES INVOICE</ThermalTitle>

      <section className="space-y-0.5 text-left">
        <ThermalMetaRow label="Bill #" value={detail.saleNumber} />
        <ThermalMetaRow label="Date" value={date} />
        <ThermalMetaRow label="Time" value={time} />
        <ThermalMetaRow label="Cashier" value={cashierName} />
        <ThermalMetaRow label="Customer" value={detail.customerName} />
        {detail.status === "VOID" ? (
          <p className="pt-0.5 text-center text-sm font-bold">*** VOID ***</p>
        ) : null}
        {duplicate ? (
          <p className="pt-0.5 text-center text-base font-bold">*** DUPLICATE ***</p>
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
        <ThermalTotalsRow label="Subtotal" value={money(detail.subtotal)} />
        {detail.gstAmount > 0 ? (
          <ThermalTotalsRow label="GST" value={money(detail.gstAmount)} />
        ) : null}
        {detail.salesTaxAmount > 0 ? (
          <ThermalTotalsRow
            label={`Sales tax (${detail.salesTaxRate}%)`}
            value={money(detail.salesTaxAmount)}
          />
        ) : null}
      </section>

      <ThermalRule variant="thick" />

      <section className="space-y-0.5">
        <ThermalTotalsRow label="BILL TOTAL" value={money(detail.total)} grand />
        {returnCredit ? (
          <ThermalTotalsRow
            label={`Return credit (${returnCredit.returnNumber})`}
            value={`−${money(returnCredit.amount)}`}
          />
        ) : null}
        {returnCredit && cashBackFromCredit > 0 ? (
          <ThermalTotalsRow label="Cash back" value={money(cashBackFromCredit)} />
        ) : null}
        <ThermalTotalsRow label="Net amount" value={money(netAmount)} />
      </section>

      {paymentRows.length > 0 || hasCashOverpay ? (
        <>
          <ThermalRule />
          <section className="space-y-0.5">
            {paymentRows.map((payment) => (
              <ThermalTotalsRow
                key={payment.id}
                label={paymentMethodLabel(payment.method)}
                value={money(payment.amount)}
              />
            ))}
            {hasCashOverpay ? (
              <>
                <ThermalTotalsRow label="Paid" value={money(detail.cashTendered!)} />
                <ThermalTotalsRow label="Change" value={money(cashChange)} bold />
              </>
            ) : null}
          </section>
        </>
      ) : null}

      {showFbrNumber || showFbrError ? (
        <>
          <ThermalRule />
          {showFbrNumber && detail.fbrInvoiceNumber ? (
            <section className="flex items-center gap-3 text-left">
              <div className="thermal-fbr-qr shrink-0 border border-dashed border-black p-1">
                <FbrInvoiceQr value={detail.fbrInvoiceNumber} />
              </div>
              <div className="min-w-0 space-y-0.5">
                <p className="font-bold">FBR Invoice #</p>
                <p className="break-all">{detail.fbrInvoiceNumber}</p>
                <p>Scan to verify with FBR</p>
              </div>
            </section>
          ) : (
            <p className="text-center text-xs font-bold">{detail.fbrError}</p>
          )}
        </>
      ) : null}

      <ThermalRule />

      <section className="pt-0.5 text-left text-[10px] leading-snug">
        <p className="mb-1 text-center text-[11px] font-bold">RETURN &amp; EXCHANGE POLICY</p>
        <ol className="space-y-0.5">
          <li>1. Items can only be exchanged within 7 days of purchase.</li>
          <li>2. Original receipt must be presented for exchange.</li>
          <li>3. Products sold under offer/discount/promotion cannot be exchanged.</li>
        </ol>
      </section>

      <ThermalRule />

      <section className="pt-0.5 text-center leading-tight">
        <p className="text-sm font-bold">Thanks for visiting us</p>
        <p className="mt-0.5 text-[11px] font-bold">No Bill No Return</p>
      </section>

      <footer className="pt-2 text-center text-[9px] leading-snug">
        <p>This software design &amp; developed by</p>
        <p>Innovinci Technologies · www.innovinci.com</p>
      </footer>

      <div className="thermal-receipt-feed" aria-hidden="true" />
    </article>
  );
}
