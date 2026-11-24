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
  const isDraft = detail.returnNumber === "DRAFT";

  return (
    <article data-thermal-receipt className={THERMAL_RECEIPT_CLASS}>
      <ThermalReceiptHeader
        businessName={businessName}
        businessAddress={businessAddress}
        businessPhone={businessPhone}
        ntn={sale.fbrSellerNtn}
      />

      <ThermalRule />

      <p className="text-center text-sm font-bold tracking-wide">
        CUSTOMER RETURN
      </p>

      <section className="space-y-0.5 text-left">
        {isDraft ? (
          <p className="text-center text-[11px] font-bold">
            *** DRAFT — NOT ISSUED ***
          </p>
        ) : isPending ? (
          <p className="text-center text-[11px] font-bold">
            PENDING — present to cashier for refund
          </p>
        ) : null}
        <ThermalMetaRow label="Return #" value={detail.returnNumber} />
        <ThermalMetaRow label="Date" value={returnDate.date} />
        <ThermalMetaRow label="Manager" value={managerName} />
      </section>

      {isDraft ? null : <ThermalReceiptBarcode value={detail.returnNumber} />}

      <ThermalRule />

      <section className="space-y-0.5 text-left">
        <p className="text-center text-[11px] font-bold tracking-wide">
          ORIGINAL INVOICE
        </p>
        <ThermalMetaRow label="Bill #" value={sale.saleNumber} />
        <ThermalMetaRow label="Date" value={salePosted.date} />
        <ThermalMetaRow label="Time" value={salePosted.time} />
        <div className="space-y-1 pt-1 text-[11px]">
          {sale.items.map((item) => (
            <div key={item.id}>
              <p className="font-bold break-normal">
                {lineProductLabel(item.productName, item.variantName)}
              </p>
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 break-normal">
                  {item.quantity} x {formatMoney(item.unitPrice)} Disc{" "}
                  {formatDiscountPercent(item.discountPercent ?? 0)}% FOC{" "}
                  {formatFocQuantity(item.focQuantity ?? 0)}
                </span>
                <span className="shrink-0 tabular-nums whitespace-nowrap">
                  {formatMoney(item.lineTotal)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <ThermalTotalsRow
        label="Original gross"
        value={formatMoney(sale.total)}
      />

      <ThermalRule />

      <section className="space-y-1 text-left">
        <p className="text-center text-[11px] font-bold tracking-wide">
          RETURNED ITEMS
        </p>
        {detail.items.map((item) => (
          <div key={item.id} className="text-[11px]">
            <p className="font-bold break-normal">
              {lineProductLabel(item.productName, item.variantName)}
            </p>
            <div className="flex items-start justify-between gap-2">
              <span>Qty {item.quantity}</span>
              <span className="shrink-0 tabular-nums whitespace-nowrap">
                {formatMoney(item.lineTotal)}
              </span>
            </div>
          </div>
        ))}
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
          label="REFUND TOTAL"
          value={formatMoney(detail.refundTotal)}
          bold
        />
        <ThermalTotalsRow
          label="Method"
          value={paymentMethodLabel(detail.refundMethod)}
        />
      </section>

      <ThermalRule />

      {isPending ? (
        <p className="text-center text-[10px] font-bold">
          Cashier will refund at till — present this voucher
        </p>
      ) : isDraft ? null : (
        <p className="text-center text-[11px] font-bold">
          ** REFUND COMPLETED **
        </p>
      )}

      <ThermalRule />

      <section className="text-left text-[11px]">
        <p>Customer signature</p>
        <div className="mt-8 border-t border-dashed border-black" />
      </section>

      <footer className="pt-2 text-center text-[9px] leading-tight font-semibold">
        <p>Software by Innovinci Technologies ·</p>
        <p>www.innovincitech.com</p>
      </footer>
    </article>
  );
}
