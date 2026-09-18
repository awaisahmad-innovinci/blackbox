import type { InventoryOutDetail } from "@blackbox/shared";
import { loadInventoryOutReturnableQuantity } from "@renderer/lib/local-db/entity-source";
import type { DraftOutReturnLine } from "./AddInventoryOutReturnItemDialog";

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export async function draftLinesFromInventoryOut(
  out: InventoryOutDetail,
): Promise<DraftOutReturnLine[]> {
  const merged = new Map<
    string,
    {
      productSkuId: string;
      productName: string;
      variantName: string;
      sku: string;
      quantity: number;
      unitCost: number;
    }
  >();

  for (const item of out.items) {
    const existing = merged.get(item.productSkuId);
    if (existing) {
      existing.quantity = round4(existing.quantity + item.quantity);
    } else {
      merged.set(item.productSkuId, {
        productSkuId: item.productSkuId,
        productName: item.productName,
        variantName: item.variantName,
        sku: item.sku,
        quantity: item.quantity,
        unitCost: item.unitCost,
      });
    }
  }

  const lines: DraftOutReturnLine[] = [];

  for (const item of merged.values()) {
    const { quantityAvailable } = await loadInventoryOutReturnableQuantity(
      out.warehouseId,
      item.productSkuId,
    );
    if (!(quantityAvailable > 0)) continue;

    lines.push({
      productSkuId: item.productSkuId,
      productName: item.productName,
      variantName: item.variantName,
      sku: item.sku,
      quantity: Math.min(item.quantity, quantityAvailable),
      quantityAvailable,
      unitCost: item.unitCost,
    });
  }

  return lines;
}
