import {
  costWithGst,
  pieceCostFromPurchase,
  sellingPriceFromCostMargin,
  sellingPriceFromCostMarginGst,
} from "@blackbox/shared";

export { pieceCostFromPurchase };

export function optionalNonNegativeMargin(value: string): string | null {
  if (!value.trim()) return null;
  const n = Number(value);
  if (Number.isNaN(n) || n < 0) return "Margin must be a non-negative number";
  return null;
}

export function optionalGstPercent(value: string): string | null {
  if (!value.trim()) return null;
  const n = Number(value);
  if (Number.isNaN(n) || n < 0 || n > 100) {
    return "GST % must be between 0 and 100";
  }
  return null;
}

export function sellingGreaterThanCost(
  cost: string,
  selling: string,
  message = "Selling price must be greater than cost price",
): string | null {
  if (!cost.trim() || !selling.trim()) return null;
  const costN = Number(cost);
  const sellingN = Number(selling);
  if (Number.isNaN(costN) || Number.isNaN(sellingN)) return null;
  if (sellingN <= costN) return message;
  return null;
}

export function sellingGreaterThanCostWithGst(
  cost: string,
  gstPercent: string,
  selling: string,
  message = "Selling price must be greater than cost + GST",
): string | null {
  if (!cost.trim() || !selling.trim()) return null;
  const costN = Number(cost);
  const gstN = gstPercent.trim() ? Number(gstPercent) : 0;
  const sellingN = Number(selling);
  if (Number.isNaN(costN) || Number.isNaN(sellingN)) return null;
  const min = costWithGst(costN, Number.isNaN(gstN) ? 0 : gstN);
  if (sellingN <= min) return message;
  return null;
}

export function sellingFromMargin(cost: string, margin: string): string | null {
  if (!margin.trim() || !cost.trim()) return null;
  const costN = Number(cost);
  const marginN = Number(margin);
  if (Number.isNaN(costN) || costN <= 0 || Number.isNaN(marginN) || marginN < 0) {
    return null;
  }
  return String(sellingPriceFromCostMargin(costN, marginN));
}

export function sellingFromMarginGst(
  cost: string,
  gstPercent: string,
  margin: string,
): string | null {
  if (!margin.trim() || !cost.trim()) return null;
  const costN = Number(cost);
  const gstN = gstPercent.trim() ? Number(gstPercent) : 0;
  const marginN = Number(margin);
  if (Number.isNaN(costN) || costN <= 0 || Number.isNaN(marginN) || marginN < 0) {
    return null;
  }
  return String(
    sellingPriceFromCostMarginGst(costN, Number.isNaN(gstN) ? 0 : gstN, marginN),
  );
}

export function sellingFromPurchaseMargin(
  purchasePrice: string,
  margin: string,
  unitsPerPurchaseUnit: number,
): string | null {
  if (!margin.trim() || !purchasePrice.trim()) return null;
  const purchaseN = Number(purchasePrice);
  if (Number.isNaN(purchaseN) || purchaseN < 0) return null;
  const pieceCost = pieceCostFromPurchase(purchaseN, unitsPerPurchaseUnit);
  if (pieceCost <= 0) return null;
  return sellingFromMargin(String(pieceCost), margin);
}

export function sellingFromPurchaseMarginGst(
  purchasePrice: string,
  margin: string,
  unitsPerPurchaseUnit: number,
  gstPercent: string,
): string | null {
  if (!margin.trim() || !purchasePrice.trim()) return null;
  const purchaseN = Number(purchasePrice);
  if (Number.isNaN(purchaseN) || purchaseN < 0) return null;
  const pieceCost = pieceCostFromPurchase(purchaseN, unitsPerPurchaseUnit);
  if (pieceCost <= 0) return null;
  return sellingFromMarginGst(String(pieceCost), gstPercent, margin);
}
