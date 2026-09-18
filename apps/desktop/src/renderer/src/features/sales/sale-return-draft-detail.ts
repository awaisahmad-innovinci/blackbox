import type {
  ReturnableSaleLine,
  SaleDetail,
  SalePaymentMethod,
  SaleReturnDetail,
  SaleReturnLineRow,
} from "@blackbox/shared";
import { lineTotalAfterDiscount, saleBillTotals } from "@blackbox/shared";

export type DraftReturnLine = ReturnableSaleLine & { returnQty: number };

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export function buildReturnLineItems(
  activeLines: DraftReturnLine[],
): { items: SaleReturnLineRow[]; subtotal: number } {
  let subtotal = 0;
  const items = activeLines.map((line) => {
    const lineTotal = lineTotalAfterDiscount(
      line.returnQty,
      line.unitPrice,
      line.discountPercent,
    );
    subtotal = round4(subtotal + lineTotal);
    return {
      id: crypto.randomUUID(),
      saleLineId: line.saleLineId,
      productSkuId: line.productSkuId,
      productName: line.productName,
      variantName: line.variantName,
      sku: line.sku,
      barcode: line.barcode,
      quantity: line.returnQty,
      unitPrice: line.unitPrice,
      discountPercent: line.discountPercent,
      lineTotal,
      sellUnit: line.sellUnit,
    };
  });
  return { items, subtotal };
}

export function buildDraftSaleReturnDetail(input: {
  sale: SaleDetail;
  activeLines: DraftReturnLine[];
  returnDate: string;
  refundMethod: SalePaymentMethod;
  processedBy: string | null;
  processedByName: string | null;
}): SaleReturnDetail | null {
  if (input.activeLines.length === 0) return null;

  const { items, subtotal } = buildReturnLineItems(input.activeLines);
  const tax = saleBillTotals(
    subtotal,
    input.sale.gstRate,
    input.sale.salesTaxRate,
  );
  const now = new Date().toISOString();

  return {
    id: "draft",
    returnNumber: "DRAFT",
    saleId: input.sale.id,
    saleNumber: input.sale.saleNumber,
    warehouseId: input.sale.warehouseId,
    warehouseName: input.sale.warehouseName,
    returnDate: input.returnDate,
    status: "POSTED",
    subtotal,
    gstRate: input.sale.gstRate,
    gstAmount: tax.gstAmount,
    salesTaxRate: input.sale.salesTaxRate,
    salesTaxAmount: tax.salesTaxAmount,
    refundTotal: tax.total,
    refundMethod: input.refundMethod,
    notes: "",
    processedBy: input.processedBy,
    processedByName: input.processedByName,
    sale: input.sale,
    items,
    createdAt: now,
    updatedAt: now,
  };
}
