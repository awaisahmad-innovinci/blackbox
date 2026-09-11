import {
  pieceCostFromPurchase,
  sellingPriceFromCostMargin,
} from "@blackbox/shared";

export { pieceCostFromPurchase };

export function optionalNonNegativeMargin(value: string): string | null {
  if (!value.trim()) return null;
  const n = Number(value);
  if (Number.isNaN(n) || n < 0) return "Margin must be a non-negative number";
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

export function sellingFromMargin(cost: string, margin: string): string | null {
  if (!margin.trim() || !cost.trim()) return null;
  const costN = Number(cost);
  const marginN = Number(margin);
  if (Number.isNaN(costN) || costN <= 0 || Number.isNaN(marginN) || marginN < 0) {
    return null;
  }
  return String(sellingPriceFromCostMargin(costN, marginN));
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
