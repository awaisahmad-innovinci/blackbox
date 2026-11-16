import type { SaleLineRow } from "@blackbox/shared";
import { formatMoney, splitInclusiveGst } from "@blackbox/shared";
import JsBarcode from "jsbarcode";
import { RECEIPT_LOGO_SRC } from "@renderer/lib/brand";
import { useEffect, useRef, type ReactNode } from "react";

export { formatMoney };

/** Receipt money: always two decimals, thousands separators (e.g. 1,000.00). Display only. */
export function receiptMoney(value: number): string {
  const amount = Number.isFinite(value) ? value : 0;
  return (Math.round(amount * 100) / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
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

/** Sale lines: "ITEM / QTY x PRICE | GST | TOTAL". Disc / FOC shown only when used. */
export function ThermalSaleLineItems({ items }: { items: SaleLineRow[] }) {
  return (
    <section className="text-left">
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-1 font-bold">
        <span className="whitespace-nowrap">ITEM / QTY x PRICE</span>
        <span className="w-[8ch] text-right">GST</span>
        <span className="w-[9ch] text-right">TOTAL</span>
      </div>
      <ThermalRule variant="solid" />
      <div className="space-y-1.5">
        {items.map((item) => {
          const { exGst, gstAmount } = splitInclusiveGst(
            item.lineTotal,
            item.gstPercent ?? 0,
          );
          const exGstUnit =
            item.quantity > 0 ? round4(exGst / item.quantity) : exGst;
          const disc = item.discountPercent ?? 0;
          const foc = item.focQuantity ?? 0;

          return (
            <div key={item.id} className="break-inside-avoid">
              <p className="font-bold break-words uppercase">
                {saleReceiptProductLabel(item.productName, item.variantName)}
              </p>
              <div className="grid grid-cols-[1fr_auto_auto] gap-x-1 tabular-nums">
                <span>
                  {item.quantity} x {receiptMoney(exGstUnit)}
                </span>
                <span className="w-[8ch] text-right">{receiptMoney(gstAmount)}</span>
                <span className="w-[9ch] text-right">{receiptMoney(item.lineTotal)}</span>
              </div>
              {disc > 0 || foc > 0 ? (
                <p className="text-[10px]">
                  {disc > 0 ? `Disc ${formatDiscountPercent(disc)}%` : null}
                  {disc > 0 && foc > 0 ? " · " : null}
                  {foc > 0 ? `FOC ${formatFocQuantity(foc)}` : null}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export const THERMAL_RECEIPT_CLASS =
  "thermal-receipt mx-auto w-full max-w-[72mm] bg-white px-3 pt-3 pb-8 font-mono text-[11px] leading-snug text-center text-black";

/** Logo slot, 53 x 19 mm, black and white. */
export function ThermalReceiptLogo() {
  return (
    <div className="thermal-receipt-logo mx-auto flex h-[19mm] w-[53mm] max-w-full items-center justify-center">
      <img src={RECEIPT_LOGO_SRC} alt="" className="h-full w-auto object-contain" />
    </div>
  );
}

export function ThermalReceiptHeader({
  businessName,
  businessAddress,
  businessPhone,
  ntn,
}: {
  businessName: string;
  businessAddress?: string;
  businessPhone?: string;
  /** Seller NTN / STRN, printed on the phone line (sales invoices). */
  ntn?: string | null;
}) {
  const phone = businessPhone?.trim();
  const ntnText = ntn?.trim();
  const contact = [phone ? `Tel: ${phone}` : null, ntnText ? `NTN: ${ntnText}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    // A <div>, not <header>: the print CSS hides every <header> (the app top bar).
    <div className="space-y-1">
      <ThermalReceiptLogo />
      {businessName ? (
        <p className="pt-1 text-lg leading-tight font-bold uppercase">{businessName}</p>
      ) : null}
      {businessAddress ? (
        <p className="text-[11px] leading-snug whitespace-pre-wrap">{businessAddress}</p>
      ) : null}
      {contact ? <p className="text-[11px] leading-snug">{contact}</p> : null}
    </div>
  );
}

/** Dashed by default; "solid" under column headers; "thick" above the grand total. */
export function ThermalRule({ variant = "dashed" }: { variant?: "dashed" | "solid" | "thick" }) {
  return (
    <hr
      className={`thermal-rule thermal-rule--${variant} my-1.5 border-0 border-t border-black ${
        variant === "dashed" ? "border-dashed" : variant === "thick" ? "border-t-2" : "border-solid"
      }`}
    />
  );
}

/** Spaced section title between dashed rules, e.g. SALES INVOICE. */
export function ThermalTitle({ children }: { children: ReactNode }) {
  return (
    <>
      <ThermalRule />
      <p className="py-0.5 text-sm font-bold tracking-[0.2em]">{children}</p>
      <ThermalRule />
    </>
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
    <div className="flex justify-between gap-2 text-left text-[11px]">
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
        height: 44,
        displayValue: true,
        font: "monospace",
        fontOptions: "bold",
        fontSize: 11,
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
  grand,
}: {
  label: string;
  value: ReactNode;
  bold?: boolean;
  /** Grand total line (BILL TOTAL / REFUND TOTAL). */
  grand?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-2 text-left tabular-nums ${
        grand ? "py-0.5 text-base font-bold" : bold ? "text-[12px] font-bold" : "text-[11px]"
      }`}
    >
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
