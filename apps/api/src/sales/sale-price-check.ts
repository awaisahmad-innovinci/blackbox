import { Logger } from "@nestjs/common";

const logger = new Logger("SalePriceCheck");

/** True when the till's unit price matches the SKU's piece or box price (to the paisa). */
export function unitPriceMatchesSku(
  unitPrice: number,
  sku: { sellingPrice: string; sellingPricePerPurchaseUnit: string | null },
): boolean {
  const candidates = [sku.sellingPrice, sku.sellingPricePerPurchaseUnit]
    .filter((v): v is string => v != null && v !== "")
    .map(Number);
  return candidates.some((price) => Math.abs(price - unitPrice) < 0.01);
}

/**
 * ponytail: log-only price check (review M1). The till's price is still accepted.
 * Upgrade to rejecting the line once the logs show no false positives.
 */
export function warnIfUnitPriceDiffers(input: {
  tenantId: string;
  saleNumber: string;
  quantity: number;
  unitPrice: number;
  sku: {
    sku: string;
    sellingPrice: string;
    sellingPricePerPurchaseUnit: string | null;
  };
}): void {
  if (!(input.quantity > 0)) return;
  if (unitPriceMatchesSku(input.unitPrice, input.sku)) return;
  logger.warn(
    `Sale ${input.saleNumber} (tenant ${input.tenantId}): SKU ${input.sku.sku} sold at ${input.unitPrice}, ` +
      `SKU price ${input.sku.sellingPrice} / box ${input.sku.sellingPricePerPurchaseUnit ?? "-"}`,
  );
}
