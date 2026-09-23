import type { SaleLineRow } from "@blackbox/shared";
import { splitInclusiveGst } from "@blackbox/shared";
import JsBarcode from "jsbarcode";
import { Fragment, useEffect, useRef, type ReactNode } from "react";

export function formatMoney(value: number): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export function formatDiscountPercent(value: number): string {
  if (value <= 0) return "0";
  return value.toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });
}

export function formatFocQuantity(value: number): string {
  if (value <= 0) return "0";
  return String(Math.floor(value));
}

export function formatReceiptDateTime(iso: string | null | undefined): {
  date: string;
  time: string;
} {
  if (!iso) return { date: "—", time: "—" };
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "2-digit",
    }),
    time: d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
  };
}

export function lineProductLabel(name: string, variant: string): string {
  const productName = name.trim();
  const variantName = variant.trim();
  if (variantName) return `${productName} · ${variantName}`;
  return productName;
}

/** Sale receipt only — variant shown as `(Variant)`. */
export function saleReceiptProductLabel(name: string, variant: string): string {
  const productName = name.trim();
  const variantName = variant.trim();
  if (variantName) return `${productName} (${variantName})`;
  return productName;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

const THERMAL_SALE_COL_CLASS = {
  qty: "w-6 py-0.5 text-right tabular-nums align-top font-semibold",
  disc: "w-6 py-0.5 text-right tabular-nums align-top font-semibold",
  foc: "w-5 py-0.5 text-right tabular-nums align-top font-semibold",
  price: "w-9 py-0.5 text-right tabular-nums align-top font-semibold",
  gst: "w-8 py-0.5 text-right tabular-nums align-top font-semibold",
  total: "w-9 py-0.5 text-right tabular-nums align-top font-semibold",
} as const;

export function ThermalSaleLineItems({ items }: { items: SaleLineRow[] }) {
  return (
    <>
      <table className="w-full border-collapse text-left text-[11px]">
        <thead>
          <tr>
            <th className={`${THERMAL_SALE_COL_CLASS.qty} font-bold`}>Qty</th>
            <th className={`${THERMAL_SALE_COL_CLASS.disc} font-bold`}>Disc</th>
            <th className={`${THERMAL_SALE_COL_CLASS.foc} font-bold`}>FOC</th>
            <th className={`${THERMAL_SALE_COL_CLASS.price} font-bold`}>Price</th>
            <th className={`${THERMAL_SALE_COL_CLASS.gst} font-bold`}>GST</th>
            <th className={`${THERMAL_SALE_COL_CLASS.total} font-bold`}>Total</th>
          </tr>
        </thead>
      </table>

      <ThermalRule />

      <table className="w-full border-collapse text-left text-[11px]">
        <tbody>
          {items.map((item) => {
            const { exGst, gstAmount } = splitInclusiveGst(
              item.lineTotal,
              item.gstPercent ?? 0,
            );
            const exGstUnit =
              item.quantity > 0 ? round4(exGst / item.quantity) : exGst;

            return (
              <Fragment key={item.id}>
                <tr>
                  <td
                    colSpan={6}
                    className="py-0.5 text-left align-top break-words font-bold"
                  >
                    {saleReceiptProductLabel(item.productName, item.variantName)}
                  </td>
                </tr>
                <tr>
                  <td className={THERMAL_SALE_COL_CLASS.qty}>{item.quantity}</td>
                  <td className={THERMAL_SALE_COL_CLASS.disc}>
                    {formatDiscountPercent(item.discountPercent ?? 0)}%
                  </td>
                  <td className={THERMAL_SALE_COL_CLASS.foc}>
                    {formatFocQuantity(item.focQuantity ?? 0)}
                  </td>
                  <td className={THERMAL_SALE_COL_CLASS.price}>
                    {formatMoney(exGstUnit)}
                  </td>
                  <td className={THERMAL_SALE_COL_CLASS.gst}>
                    {formatMoney(gstAmount)}
                  </td>
                  <td className={THERMAL_SALE_COL_CLASS.total}>
                    {formatMoney(item.lineTotal)}
                  </td>
                </tr>
                <tr>
                  <td colSpan={6} className="p-0">
                    <ThermalRule />
                  </td>
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

export const THERMAL_RECEIPT_CLASS =
  "thermal-receipt mx-auto w-full max-w-[62mm] px-3 pt-2 pb-8 font-mono text-[11px] font-semibold leading-snug text-center text-black";

export function ThermalReceiptHeader({
  businessName,
  businessAddress,
  businessPhone,
}: {
  businessName: string;
  businessAddress?: string;
  businessPhone?: string;
}) {
  const phone = businessPhone?.trim();

  return (
    <header className="space-y-1">
      {businessName ? (
        <p className="text-lg font-bold leading-tight">{businessName}</p>
      ) : null}
      {businessAddress ? (
        <p className="text-xs font-semibold leading-snug whitespace-pre-wrap">
          {businessAddress}
        </p>
      ) : null}
      {phone ? (
        <p className="text-xs font-semibold leading-snug">Tel: {phone}</p>
      ) : null}
    </header>
  );
}

export function ThermalRule() {
  return <hr className="thermal-rule my-1 border-0 border-t border-solid border-black" />;
}

export function ThermalMetaRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex justify-between gap-2 text-left text-[11px] font-semibold">
      <span>{label}</span>
      <span className="text-right tabular-nums">{value}</span>
    </div>
  );
}

export function ThermalReceiptBarcode({ value }: { value: string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const trimmed = value.trim();

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !trimmed || trimmed === "DRAFT") return;

    svg.innerHTML = "";
    try {
      JsBarcode(svg, trimmed, {
        format: "CODE128",
        width: 1,
        height: 50,
        displayValue: true,
        fontSize: 10,
        margin: 10,
        textMargin: 2,
      });
    } catch {
      /* invalid barcode value */
    }
  }, [trimmed]);

  if (!trimmed || trimmed === "DRAFT") return null;

  return (
    <div className="thermal-receipt-barcode mx-auto w-full max-w-[48mm] break-inside-avoid py-2">
      <svg ref={svgRef} className="mx-auto block h-auto max-w-full" />
    </div>
  );
}

export function ThermalTotalsRow({
  label,
  value,
  bold,
}: {
  label: string;
  value: ReactNode;
  bold?: boolean;
}) {
  return (
    <div
      className={`flex justify-between gap-2 text-left text-[11px] font-semibold ${bold ? "text-sm font-bold" : ""}`}
    >
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
