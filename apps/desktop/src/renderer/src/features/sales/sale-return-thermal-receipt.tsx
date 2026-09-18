import type { SalePaymentMethod, SaleReturnDetail } from "@blackbox/shared";

function paymentMethodLabel(method: SalePaymentMethod): string {
  if (method === "CASH") return "Cash";
  if (method === "CARD") return "Card";
  return "Credit";
}

function formatMoney(value: number): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function lineProductLabel(name: string, variant: string): string {
  const productName = name.trim();
  const variantName = variant.trim();
  if (variantName) return `${productName} · ${variantName}`;
  return productName;
}

function formatDiscountPercent(value: number): string {
  if (value <= 0) return "0";
  return value.toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });
}

function formatFocQuantity(value: number): string {
  if (value <= 0) return "0";
  return String(Math.floor(value));
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
  const returnLabel = new Date(detail.returnDate).toLocaleDateString();
  const salePostedLabel = sale.postedAt
    ? new Date(sale.postedAt).toLocaleString()
    : "—";

  return (
    <article
      data-thermal-receipt
      className="thermal-receipt mx-auto w-full max-w-[72mm] font-mono text-xs leading-snug"
    >
      <header className="space-y-1 text-center">
        {businessName ? (
          <p className="text-sm font-semibold">{businessName}</p>
        ) : null}
        {businessAddress ? (
          <p className="text-[11px] whitespace-pre-wrap">{businessAddress}</p>
        ) : null}
      </header>

      <hr className="thermal-rule my-2 border-border border-dashed" />

      <section className="space-y-1">
        <p className="text-center font-semibold">CUSTOMER RETURN</p>
        {detail.returnNumber === "DRAFT" ? (
          <p className="text-center text-[11px] font-semibold">*** DRAFT — NOT POSTED ***</p>
        ) : null}
        <div className="flex justify-between gap-2">
          <span>
            <span className="font-semibold">Return #:</span> {detail.returnNumber}
          </span>
        </div>
        <p className="text-[11px]">{returnLabel}</p>
        <div className="flex justify-between gap-2">
          <span>Manager</span>
          <span>{managerName}</span>
        </div>
      </section>

      <hr className="thermal-rule my-2 border-border border-dashed" />

      <section className="space-y-1">
        <p className="font-semibold">Original invoice</p>
        <div className="flex justify-between gap-2">
          <span>Invoice</span>
          <span>{sale.saleNumber}</span>
        </div>
        <p className="text-[11px]">{salePostedLabel}</p>
      </section>

      <table className="mt-2 w-full border-collapse text-[10px]">
        <thead>
          <tr className="border-border border-b border-dashed">
            <th className="py-1 text-left font-semibold">Item</th>
            <th className="w-6 py-1 text-right font-semibold">Qty</th>
            <th className="w-6 py-1 text-right font-semibold">Disc</th>
            <th className="w-5 py-1 text-right font-semibold">FOC</th>
            <th className="w-9 py-1 text-right font-semibold">Price</th>
            <th className="w-9 py-1 text-right font-semibold">Total</th>
          </tr>
        </thead>
        <tbody>
          {sale.items.map((item) => (
            <tr key={item.id} className="border-border border-b border-dashed">
              <td className="py-1 pr-1 align-top break-words">
                {lineProductLabel(item.productName, item.variantName)}
              </td>
              <td className="py-1 text-right tabular-nums align-top">
                {item.quantity}
              </td>
              <td className="py-1 text-right tabular-nums align-top">
                {formatDiscountPercent(item.discountPercent ?? 0)}%
              </td>
              <td className="py-1 text-right tabular-nums align-top">
                {formatFocQuantity(item.focQuantity ?? 0)}
              </td>
              <td className="py-1 text-right tabular-nums align-top">
                {formatMoney(item.unitPrice)}
              </td>
              <td className="py-1 text-right tabular-nums align-top">
                {formatMoney(item.lineTotal)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-1 flex justify-between gap-2 text-[11px] font-semibold">
        <span>Original gross</span>
        <span className="tabular-nums">{formatMoney(sale.total)}</span>
      </div>

      <hr className="thermal-rule my-2 border-border border-dashed" />

      <section className="space-y-1">
        <p className="font-semibold">Return</p>
        <table className="w-full border-collapse text-[10px]">
          <thead>
            <tr className="border-border border-b border-dashed">
              <th className="py-1 text-left font-semibold">Item</th>
              <th className="w-8 py-1 text-right font-semibold">Qty</th>
              <th className="w-10 py-1 text-right font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {detail.items.map((item) => (
              <tr key={item.id} className="border-border border-b border-dashed">
                <td className="py-1 pr-1 align-top break-words">
                  {lineProductLabel(item.productName, item.variantName)}
                </td>
                <td className="py-1 text-right tabular-nums align-top">
                  {item.quantity}
                </td>
                <td className="py-1 text-right tabular-nums align-top">
                  {formatMoney(item.lineTotal)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <hr className="thermal-rule my-2 border-border border-dashed" />

      <section className="space-y-1 text-[11px]">
        <div className="flex justify-between gap-2">
          <span>Refund subtotal</span>
          <span className="tabular-nums">{formatMoney(detail.subtotal)}</span>
        </div>
        {detail.gstAmount > 0 ? (
          <div className="flex justify-between gap-2">
            <span>GST ({detail.gstRate}%)</span>
            <span className="tabular-nums">{formatMoney(detail.gstAmount)}</span>
          </div>
        ) : null}
        {detail.salesTaxAmount > 0 ? (
          <div className="flex justify-between gap-2">
            <span>Sales tax ({detail.salesTaxRate}%)</span>
            <span className="tabular-nums">
              {formatMoney(detail.salesTaxAmount)}
            </span>
          </div>
        ) : null}
        <div className="flex justify-between gap-2 text-sm font-semibold">
          <span>Refund</span>
          <span className="tabular-nums">{formatMoney(detail.refundTotal)}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span>Method</span>
          <span>{paymentMethodLabel(detail.refundMethod)}</span>
        </div>
        <p className="pt-1 text-center text-[10px]">
          Refund recorded — not deducted from till
        </p>
      </section>
    </article>
  );
}
