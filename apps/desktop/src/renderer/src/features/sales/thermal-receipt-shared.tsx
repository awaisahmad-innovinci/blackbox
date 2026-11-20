import type { SaleLineRow } from "@blackbox/shared";
import { formatMoney, splitInclusiveGst } from "@blackbox/shared";
import JsBarcode from "jsbarcode";
import { useEffect, useRef, type ReactNode } from "react";

export { formatMoney };

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

export function ThermalSaleLineItems({ items }: { items: SaleLineRow[] }) {
  return (
    <div className="text-left text-[11px]">
      <div className="flex items-end justify-between gap-2 text-[10px] font-bold">
        <span>ITEM / QTY x PRICE</span>
        <span className="flex shrink-0 gap-2">
          <span className="w-12 text-right">GST</span>
          <span className="w-14 text-right">TOTAL</span>
        </span>
      </div>
      <ThermalRule />
      <div className="space-y-1">
        {items.map((item) => {
          const { exGst, gstAmount } = splitInclusiveGst(
            item.lineTotal,
            item.gstPercent ?? 0,
          );
          const exGstUnit =
            item.quantity > 0 ? round4(exGst / item.quantity) : exGst;
          const discount = item.discountPercent ?? 0;
          const foc = item.focQuantity ?? 0;
          const extras = [
            discount > 0 ? `Disc ${formatDiscountPercent(discount)}%` : null,
            foc > 0 ? `FOC ${formatFocQuantity(foc)}` : null,
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <div key={item.id}>
              <p className="font-bold break-normal">
                {saleReceiptProductLabel(item.productName, item.variantName)}
              </p>
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 break-normal">
                  {item.quantity} x {formatMoney(exGstUnit)}
                  {extras ? ` ${extras}` : ""}
                </span>
                <span className="flex shrink-0 gap-2 tabular-nums whitespace-nowrap">
                  <span className="w-12 text-right">{formatMoney(gstAmount)}</span>
                  <span className="w-14 text-right">
                    {formatMoney(item.lineTotal)}
                  </span>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const THERMAL_RECEIPT_CLASS =
  "thermal-receipt mx-auto w-full max-w-[72mm] px-1 pt-2 pb-8 font-sans text-[11px] font-semibold leading-snug text-center text-black";

export function ThermalReceiptHeader({
  businessName,
  businessAddress,
  businessPhone,
  ntn,
}: {
  businessName: string;
  businessAddress?: string;
  businessPhone?: string;
  ntn?: string | null;
}) {
  const phone = businessPhone?.trim();
  const taxId = ntn?.trim();
  const contact = [
    phone ? `Tel: ${phone}` : null,
    taxId ? `NTN: ${taxId}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <header className="space-y-0.5">
      {businessName ? (
        <p className="text-lg font-bold leading-tight tracking-tight">
          {businessName}
        </p>
      ) : null}
      {businessAddress ? (
        <p className="text-xs font-semibold leading-snug whitespace-pre-wrap">
          {businessAddress}
        </p>
      ) : null}
      {contact ? (
        <p className="text-xs font-semibold leading-snug">{contact}</p>
      ) : null}
    </header>
  );
}

export function ThermalRule() {
  return (
    <hr className="thermal-rule my-1 border-0 border-t border-dashed border-black" />
  );
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
      <span className="min-w-0 break-normal">{label}</span>
      <span className="shrink-0 text-right tabular-nums whitespace-nowrap">
        {value}
      </span>
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
        width: 2,
        height: 60,
        displayValue: true,
        fontSize: 12,
        margin: 0,
        textMargin: 2,
      });
    } catch {
      /* invalid barcode value */
    }
  }, [trimmed]);

  if (!trimmed || trimmed === "DRAFT") return null;

  return (
    <div className="thermal-receipt-barcode mx-auto w-full max-w-full break-inside-avoid py-1">
      <svg ref={svgRef} className="mx-auto block h-[16mm] w-full" />
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
      <span className="min-w-0 break-normal">{label}</span>
      <span className="shrink-0 tabular-nums whitespace-nowrap">{value}</span>
    </div>
  );
}
