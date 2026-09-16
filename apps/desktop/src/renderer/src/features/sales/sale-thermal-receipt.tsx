import type { SaleDetail, SalePaymentMethod } from "@blackbox/shared";

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

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function lineProductLabel(item: SaleDetail["items"][number]): string {
  const name = item.productName.trim();
  const variant = item.variantName.trim();
  if (variant) return `${name} · ${variant}`;
  return name;
}

export function SaleThermalReceipt({
  detail,
  businessName,
  businessAddress,
  cashierName,
}: {
  detail: SaleDetail;
  businessName: string;
  businessAddress?: string;
  cashierName: string;
}) {
  const totalItems = detail.items.length;
  const totalQty = detail.items.reduce((sum, item) => sum + item.quantity, 0);
  const postedLabel = detail.postedAt
    ? new Date(detail.postedAt).toLocaleString()
    : "—";
  const hasCashOverpay =
    detail.cashTendered != null && detail.cashTendered > detail.total;
  const cashChange = hasCashOverpay
    ? round4(detail.cashTendered! - detail.total)
    : 0;
  const nonCashPayments = detail.payments.filter(
    (payment) => payment.method !== "CASH",
  );

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
        <p>
          <span className="font-semibold">Customer:</span> {detail.customerName}
        </p>
        <div className="flex justify-between gap-2">
          <span>
            <span className="font-semibold">Invoice:</span> {detail.saleNumber}
          </span>
        </div>
        <p className="text-[11px]">{postedLabel}</p>
        {detail.status === "VOID" ? (
          <p className="text-center font-semibold">*** VOID ***</p>
        ) : null}
      </section>

      <hr className="thermal-rule my-2 border-border border-dashed" />

      <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr className="border-border border-b border-dashed">
            <th className="py-1 text-left font-semibold">Item</th>
            <th className="w-8 py-1 text-right font-semibold">Qty</th>
            <th className="w-12 py-1 text-right font-semibold">Price</th>
            <th className="w-12 py-1 text-right font-semibold">Total</th>
          </tr>
        </thead>
        <tbody>
          {detail.items.map((item) => (
            <tr key={item.id} className="border-border border-b border-dashed">
              <td className="py-1 pr-1 align-top break-words">
                {lineProductLabel(item)}
              </td>
              <td className="py-1 text-right tabular-nums align-top">
                {item.quantity}
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

      <hr className="thermal-rule my-2 border-border border-dashed" />

      <section className="space-y-1 text-[11px]">
        <div className="flex justify-between gap-2">
          <span>Total Items</span>
          <span className="tabular-nums">{totalItems}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span>Total Qty</span>
          <span className="tabular-nums">{totalQty}</span>
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
        {hasCashOverpay ? (
          <>
            <div className="flex justify-between gap-2">
              <span>Cash</span>
              <span className="tabular-nums">
                {formatMoney(detail.cashTendered!)}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span>Change</span>
              <span className="tabular-nums">{formatMoney(cashChange)}</span>
            </div>
          </>
        ) : null}
        <div className="flex justify-between gap-2 text-sm font-semibold">
          <span>Gross Total</span>
          <span className="tabular-nums">{formatMoney(detail.total)}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span>Cashier</span>
          <span>{cashierName}</span>
        </div>
        {nonCashPayments.map((payment) => (
          <div key={payment.id} className="flex justify-between gap-2">
            <span>{paymentMethodLabel(payment.method)}</span>
            <span className="tabular-nums">{formatMoney(payment.amount)}</span>
          </div>
        ))}
      </section>
    </article>
  );
}
