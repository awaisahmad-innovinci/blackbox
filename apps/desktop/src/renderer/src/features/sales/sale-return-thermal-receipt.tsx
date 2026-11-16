import type { SalePaymentMethod, SaleReturnDetail } from "@blackbox/shared";
import {
  THERMAL_RECEIPT_CLASS,
  ThermalMetaRow,
  ThermalReceiptBarcode,
  ThermalReceiptHeader,
  ThermalRule,
  ThermalTitle,
  ThermalTotalsRow,
  formatDiscountPercent,
  formatFocQuantity,
  formatReceiptDateTime,
  lineProductLabel,
  receiptMoney,
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

  const money = receiptMoney;

  return (
    <article data-thermal-receipt className={THERMAL_RECEIPT_CLASS}>
      <ThermalReceiptHeader
        businessName={businessName}
        businessAddress={businessAddress}
        businessPhone={businessPhone}
      />

      <ThermalTitle>CUSTOMER RETURN</ThermalTitle>

      <section className="space-y-0.5 text-left">
        {detail.returnNumber === "DRAFT" ? (
          <p className="text-center font-bold">*** DRAFT — NOT ISSUED ***</p>
        ) : isPending ? (
          <p className="text-center font-bold">PENDING — present to cashier for refund</p>
        ) : null}
        <ThermalMetaRow label="Return #" value={detail.returnNumber} />
        <ThermalMetaRow label="Date" value={returnDate.date} />
        <ThermalMetaRow label="Manager" value={managerName} />
      </section>

      {detail.returnNumber !== "DRAFT" ? (
        <ThermalReceiptBarcode value={detail.returnNumber} />
      ) : null}

      <ThermalRule />

      <section className="space-y-0.5 text-left">
        <p className="text-center font-bold">ORIGINAL INVOICE</p>
        <ThermalMetaRow label="Bill #" value={sale.saleNumber} />
        <ThermalMetaRow label="Date" value={salePosted.date} />
        <ThermalMetaRow label="Time" value={salePosted.time} />
      </section>

      <ThermalRule variant="solid" />

      <section className="space-y-1 text-left">
        {sale.items.map((item) => (
          <div key={item.id} className="break-inside-avoid">
            <p className="font-bold break-words uppercase">
              {lineProductLabel(item.productName, item.variantName)}
            </p>
            <div className="flex justify-between gap-2 tabular-nums">
              <span>
                {item.quantity} x {money(item.unitPrice)} Disc{" "}
                {formatDiscountPercent(item.discountPercent ?? 0)}% FOC{" "}
                {formatFocQuantity(item.focQuantity ?? 0)}
              </span>
              <span>{money(item.lineTotal)}</span>
            </div>
          </div>
        ))}
        <ThermalTotalsRow label="Original gross" value={money(sale.total)} />
      </section>

      <ThermalRule />

      <section className="space-y-1 text-left">
        <p className="text-center font-bold">RETURNED ITEMS</p>
        {detail.items.map((item) => (
          <div key={item.id} className="break-inside-avoid">
            <p className="font-bold break-words uppercase">
              {lineProductLabel(item.productName, item.variantName)}
            </p>
            <div className="flex justify-between gap-2 tabular-nums">
              <span>Qty {item.quantity}</span>
              <span>{money(item.lineTotal)}</span>
            </div>
          </div>
        ))}
      </section>

      <ThermalRule variant="solid" />

      <section className="space-y-0.5">
        <ThermalTotalsRow label="Refund subtotal" value={money(detail.subtotal)} />
        {detail.gstAmount > 0 ? (
          <ThermalTotalsRow
            label={detail.gstRate > 0 ? `GST (${detail.gstRate}%)` : "GST"}
            value={money(detail.gstAmount)}
          />
        ) : null}
        {detail.salesTaxAmount > 0 ? (
          <ThermalTotalsRow
            label={`Sales tax (${detail.salesTaxRate}%)`}
            value={money(detail.salesTaxAmount)}
          />
        ) : null}
        <ThermalTotalsRow label="REFUND TOTAL" value={money(detail.refundTotal)} grand />
        <ThermalTotalsRow label="Method" value={paymentMethodLabel(detail.refundMethod)} />
      </section>

      <ThermalRule />

      <p className="py-0.5 text-center font-bold tracking-[0.15em]">
        {isPending
          ? "** CASHIER WILL REFUND AT TILL **"
          : "** REFUND COMPLETED **"}
      </p>

      <section className="pt-8 text-left">
        <div className="border-t border-solid border-black" />
        <p className="pt-1">Customer signature</p>
      </section>

      <ThermalRule />

      <footer className="text-center text-[9px] leading-snug">
        <p>Software by Innovinci Technologies ·</p>
        <p>www.innovinci.com</p>
      </footer>

      <div className="thermal-receipt-feed" aria-hidden="true" />
    </article>
  );
}
