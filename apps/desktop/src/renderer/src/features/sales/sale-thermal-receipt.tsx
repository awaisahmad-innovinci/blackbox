import type { SaleDetail, SalePaymentMethod } from "@blackbox/shared";
import {
  THERMAL_RECEIPT_CLASS,
  ThermalMetaRow,
  ThermalReceiptBarcode,
  ThermalReceiptHeader,
  ThermalRule,
  ThermalTotalsRow,
  formatDiscountPercent,
  formatFocQuantity,
  formatMoney,
  formatReceiptDateTime,
  lineProductLabel,
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
  cashierName,
  returnCredit,
}: {
  detail: SaleDetail;
  businessName: string;
  businessAddress?: string;
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

  return (
    <article data-thermal-receipt className={THERMAL_RECEIPT_CLASS}>
      <ThermalReceiptHeader
        businessName={businessName}
        businessAddress={businessAddress}
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

      <ThermalRule />

      <table className="w-full border-collapse text-left text-[11px]">
        <thead>
          <tr className="border-b border-solid border-black">
            <th className="py-0.5 pr-1 text-left font-bold">Item</th>
            <th className="w-6 py-0.5 text-right font-bold">Qty</th>
            <th className="w-6 py-0.5 text-right font-bold">Disc</th>
            <th className="w-5 py-0.5 text-right font-bold">FOC</th>
            <th className="w-9 py-0.5 text-right font-bold">Price</th>
            <th className="w-9 py-0.5 text-right font-bold">Total</th>
          </tr>
        </thead>
        <tbody>
          {detail.items.map((item) => (
            <tr key={item.id}>
              <td className="py-0.5 pr-1 align-top break-words font-bold">
                {lineProductLabel(item.productName, item.variantName)}
              </td>
              <td className="py-0.5 text-right tabular-nums align-top font-normal">
                {item.quantity}
              </td>
              <td className="py-0.5 text-right tabular-nums align-top font-normal">
                {formatDiscountPercent(item.discountPercent ?? 0)}%
              </td>
              <td className="py-0.5 text-right tabular-nums align-top font-normal">
                {formatFocQuantity(item.focQuantity ? item.focQuantity : 0)}
              </td>
              <td className="py-0.5 text-right tabular-nums align-top font-normal">
                {formatMoney(item.unitPrice)}
              </td>
              <td className="py-0.5 text-right tabular-nums align-top font-normal">
                {formatMoney(item.lineTotal)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <ThermalRule />

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
          <ThermalTotalsRow
            label={`GST (${detail.gstRate}%)`}
            value={formatMoney(detail.gstAmount)}
          />
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
        {nonCashPayments.map((payment) => (
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

      <footer className="pb-0.5 text-center text-[9px] leading-tight">
        <p>This software design &amp; developed by</p>
        <p>Innovinci Technologies</p>
        <p>www.innovinci.com</p>
      </footer>
    </article>
  );
}
