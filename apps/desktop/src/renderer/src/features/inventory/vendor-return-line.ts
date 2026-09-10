import type { SellUnit } from "@blackbox/shared";

export function returnLineTotalFromPcs(
  quantityPcs: number,
  unitsPerPurchaseUnit: number,
  unitCost: number,
): number {
  const unitsPer = unitsPerPurchaseUnit > 0 ? unitsPerPurchaseUnit : 1;
  return Math.round((quantityPcs / unitsPer) * unitCost * 10000) / 10000;
}

export function returnQuantityHint(line: {
  quantity: number;
  unitsPerPurchaseUnit: number;
  baseUnitName: string | null;
  purchaseUnitName: string | null;
  sellUnit: SellUnit;
}): string | null {
  if (line.unitsPerPurchaseUnit <= 1 || line.quantity <= 0) return null;
  const boxes = Math.round((line.quantity / line.unitsPerPurchaseUnit) * 10000) / 10000;
  if (line.sellUnit === "box") {
    return `${line.quantity} ${line.baseUnitName ?? "pcs"} (${boxes} ${line.purchaseUnitName ?? "box"})`;
  }
  if (line.quantity >= line.unitsPerPurchaseUnit) {
    return `${line.quantity} ${line.baseUnitName ?? "pcs"} (${boxes} ${line.purchaseUnitName ?? "box"})`;
  }
  return null;
}

export function defaultSellUnitForScan(
  multiplier: number,
  unitsPerPurchaseUnit: number,
): SellUnit {
  return multiplier > 1 && multiplier >= unitsPerPurchaseUnit ? "box" : "pc";
}

export function formatReturnableAvailable(line: {
  quantityAvailable: number;
  unitsPerPurchaseUnit: number;
  baseUnitName: string | null;
  purchaseUnitName: string | null;
}): { primary: string; secondary: string | null } {
  const pcs = line.quantityAvailable.toLocaleString();
  const unitsPer =
    line.unitsPerPurchaseUnit > 0 ? line.unitsPerPurchaseUnit : 1;
  if (unitsPer <= 1) {
    return { primary: `${pcs} pcs`, secondary: null };
  }
  const boxes =
    Math.round((line.quantityAvailable / unitsPer) * 10000) / 10000;
  const boxLabel = line.purchaseUnitName ?? "box";
  const baseLabel = line.baseUnitName ?? "pc";
  return {
    primary: `${pcs} pcs · ${boxes.toLocaleString()} ${boxLabel}`,
    secondary: `${unitsPer} ${baseLabel} per ${boxLabel}`,
  };
}
