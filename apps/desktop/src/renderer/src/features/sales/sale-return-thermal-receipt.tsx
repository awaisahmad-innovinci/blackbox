import type { SalePaymentMethod, SaleReturnDetail } from "@blackbox/shared";
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

export function SaleReturnThermalReceipt({
  detail,
  businessName,
  businessAddress,
  businessPhone,
  managerName,
}: {
  detail: SaleReturnDetail;
  businessName: string;
  businessAddress?: string;
  businessPhone?: string;
  managerName: string;
}) {
  const sale = detail.sale;
  const returnDate = formatReceiptDateTime(`${detail.returnDate}T12:00:00`);
  const salePosted = formatReceiptDateTime(sale.postedAt);
  const isPending = detail.status === "PENDING";

  return (
    <article data-thermal-receipt className={THERMAL_RECEIPT_CLASS}>
      <ThermalReceiptHeader
        businessName={businessName}
        businessAddress={businessAddress}
        businessPhone={businessPhone}
      />

      <ThermalRule />

      <section className="space-y-0.5 text-left">
        <p className="text-center text-sm font-bold">CUSTOMER RETURN</p>
        {detail.returnNumber === "DRAFT" ? (
          <p className="text-center text-[11px] font-bold">*** DRAFT — NOT ISSUED ***</p>
        ) : isPending ? (
          <p className="text-center text-[11px] font-bold">
            PENDING — present to cashier for refund
          </p>
        ) : null}
        <ThermalMetaRow label="Return #" value={detail.returnNumber} />
        {detail.returnNumber !== "DRAFT" ? (
          <ThermalReceiptBarcode value={detail.returnNumber} />
        ) : null}
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
              <td className="py-0.5 text-right tabular-nums align-top font-semibold">
                {item.quantity}
              </td>
              <td className="py-0.5 text-right tabular-nums align-top font-semibold">
                {formatDiscountPercent(item.discountPercent ?? 0)}%
              </td>
              <td className="py-0.5 text-right tabular-nums align-top font-semibold">
                {formatFocQuantity(item.focQuantity ?? 0)}
              </td>
              <td className="py-0.5 text-right tabular-nums align-top font-semibold">
                {formatMoney(item.unitPrice)}
              </td>
              <td className="py-0.5 text-right tabular-nums align-top font-semibold">
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
                <td className="py-0.5 text-right tabular-nums align-top font-semibold">
                  {item.quantity}
                </td>
                <td className="py-0.5 text-right tabular-nums align-top font-semibold">
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
          label="Refund total"
          value={formatMoney(detail.refundTotal)}
          bold
        />
        <ThermalTotalsRow
          label="Method"
          value={paymentMethodLabel(detail.refundMethod)}
        />
        <p className="pt-0.5 text-center text-[10px]">
          {isPending
            ? "Cashier will refund at till — present this voucher"
            : "Refund completed"}
        </p>
      </section>
    </article>
  );
}
