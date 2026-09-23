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
}: {
  detail: SaleDetail;
  businessName: string;
  businessAddress?: string;
  businessPhone?: string;
  cashierName: string;
  returnCredit?: SaleReturnCreditReceipt;
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

  return (
    <article data-thermal-receipt className={THERMAL_RECEIPT_CLASS}>
      <ThermalReceiptHeader
        businessName={businessName}
        businessAddress={businessAddress}
        businessPhone={businessPhone}
      />

      <ThermalRule />

      <section className="space-y-0.5 text-left">
        <ThermalMetaRow label="Bill #" value={detail.saleNumber} />
        <ThermalMetaRow label="Date" value={date} />
        <ThermalMetaRow label="At" value={time} />
        <ThermalMetaRow label="Cashier" value={cashierName} />
        <ThermalMetaRow label="Customer" value={detail.customerName} />
        {detail.status === "VOID" ? (
          <p className="pt-0.5 text-center text-sm font-bold">*** VOID ***</p>
        ) : null}
      </section>

      <ThermalReceiptBarcode value={detail.saleNumber} />

      <ThermalSaleLineItems items={detail.items} />

      <section className="space-y-0.5">
        <ThermalTotalsRow label="Total Items" value={totalItems} />
        <ThermalTotalsRow label="Total Qty" value={totalQty} />
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
        <ThermalTotalsRow
          label="Bill total"
          value={formatMoney(detail.total)}
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
        <ThermalTotalsRow
          label="Net Amount"
          value={formatMoney(netAmount)}
          bold
        />
        {showAllPayments
          ? detail.payments.map((payment) => (
              <ThermalTotalsRow
                key={payment.id}
                label={paymentMethodLabel(payment.method)}
                value={formatMoney(payment.amount)}
              />
            ))
          : nonCashPayments.map((payment) => (
              <ThermalTotalsRow
                key={payment.id}
                label={paymentMethodLabel(payment.method)}
                value={formatMoney(payment.amount)}
              />
            ))}
      </section>

      <ThermalRule />

      <section className="pt-0.5 text-left text-[9px] leading-tight">
        <p className="mb-0.5 text-center font-bold">RETURN &amp; EXCHANGE POLICY</p>
        <ol className="list-decimal pl-4 text-left">
          <li>Items can only be exchanged within 7 days of purchase.</li>
          <li>Original receipt must be presented for exchange.</li>
          <li>Products sold under offer/discount/promotion cannot be exchanged.</li>
        </ol>
      </section>

      <section className="pt-1 text-center text-[10px] leading-tight">
        <p className="font-bold">Thanks for visiting us</p>
        <p className="mt-0.5 font-bold">No Bill No Return</p>
      </section>

      <ThermalRule />

      <footer className="text-center text-[9px] leading-tight font-semibold">
        <p>This software design &amp; developed by</p>
        <p>Innovinci Technologies</p>
        <p>www.innovinci.com</p>
      </footer>

      <div className="thermal-receipt-feed" aria-hidden="true" />
    </article>
  );
}
