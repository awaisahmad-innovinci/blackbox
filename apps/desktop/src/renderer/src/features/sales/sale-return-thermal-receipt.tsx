import type { SalePaymentMethod, SaleReturnDetail } from "@blackbox/shared";
import {
  THERMAL_RECEIPT_CLASS,
  ThermalMetaRow,
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

export function SaleReturnThermalReceipt({
  detail,
  businessName,
  businessAddress,
  managerName,
}: {
  detail: SaleReturnDetail;
  businessName: string;
  businessAddress?: string;
  managerName: string;
}) {
  const sale = detail.sale;
  const returnDate = formatReceiptDateTime(`${detail.returnDate}T12:00:00`);
  const salePosted = formatReceiptDateTime(sale.postedAt);

  return (
    <article data-thermal-receipt className={THERMAL_RECEIPT_CLASS}>
      <ThermalReceiptHeader
        businessName={businessName}
        businessAddress={businessAddress}
      />

      <ThermalRule />

      <section className="space-y-0.5 text-left">
        <p className="text-center text-sm font-bold">CUSTOMER RETURN</p>
        {detail.returnNumber === "DRAFT" ? (
          <p className="text-center text-[11px] font-bold">*** DRAFT — NOT POSTED ***</p>
        ) : null}
        <ThermalMetaRow label="Return #" value={detail.returnNumber} />
        <ThermalMetaRow label="Date" value={returnDate.date} />
        <ThermalMetaRow label="Manager" value={managerName} />
      </section>

      <ThermalRule />

      <section className="space-y-0.5 text-left">
        <p className="text-center text-[11px] font-bold">Original invoice</p>
        <ThermalMetaRow label="Bill #" value={sale.saleNumber} />
        <ThermalMetaRow label="Date" value={salePosted.date} />
        <ThermalMetaRow label="At" value={salePosted.time} />
      </section>

      <table className="mt-1 w-full border-collapse text-left text-[11px]">
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
          {sale.items.map((item) => (
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
                {formatFocQuantity(item.focQuantity ?? 0)}
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

      <ThermalTotalsRow
        label="Original gross"
        value={formatMoney(sale.total)}
        bold
      />

      <ThermalRule />

      <section className="space-y-0.5 text-left">
        <p className="text-center text-[11px] font-bold">Return</p>
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="border-b border-solid border-black">
              <th className="py-0.5 pr-1 text-left font-bold">Item</th>
              <th className="w-8 py-0.5 text-right font-bold">Qty</th>
              <th className="w-10 py-0.5 text-right font-bold">Total</th>
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
                  {formatMoney(item.lineTotal)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <ThermalRule />

      <section className="space-y-0.5">
        <ThermalTotalsRow
          label="Refund subtotal"
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
          label="Refund"
          value={formatMoney(detail.refundTotal)}
          bold
        />
        <ThermalTotalsRow
          label="Method"
          value={paymentMethodLabel(detail.refundMethod)}
        />
        <p className="pt-0.5 text-center text-[10px]">
          Refund recorded — not deducted from till
        </p>
      </section>
    </article>
  );
}
