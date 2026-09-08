import type { ProductSkuDetail, VendorSku } from "@blackbox/shared";
import { vendorSkusApi } from "@renderer/lib/api/vendor-skus";
import { commitLocalChange, isDeviceBound } from "@renderer/lib/local-db/local-write";
import { syncNow } from "@renderer/lib/sync/sync-status";

export function purchasePriceFromSku(sku: ProductSkuDetail): number {
  const unitsPer =
    sku.unitsPerPurchaseUnit != null && sku.unitsPerPurchaseUnit > 0
      ? sku.unitsPerPurchaseUnit
      : 1;
  return (sku.costPrice ?? 0) * unitsPer;
}

export type CreateVendorSkuLinkInput = {
  vendorId: string;
  productName: string;
  sku: ProductSkuDetail;
  minimumOrderQuantity?: number;
  leadTimeDays?: number;
  isPreferred?: boolean;
};

export async function createVendorSkuLink(
  input: CreateVendorSkuLinkInput,
): Promise<{ row: VendorSku; cacheWarning: boolean }> {
  const {
    vendorId,
    productName,
    sku,
    minimumOrderQuantity = 1,
    leadTimeDays = 0,
    isPreferred = false,
  } = input;
  const unitsPerUnit =
    sku.unitsPerPurchaseUnit != null && sku.unitsPerPurchaseUnit > 0
      ? sku.unitsPerPurchaseUnit
      : 1;
  const price = purchasePriceFromSku(sku);

  let row: VendorSku;
  if (await isDeviceBound()) {
    const localId = crypto.randomUUID();
    row = {
      id: localId,
      vendorId,
      productSkuId: sku.id,
      vendorSkuCode: null,
      purchasePrice: price,
      purchaseUnitId: sku.purchaseUnitId,
      purchaseUnitName: sku.purchaseUnitName,
      unitsPerPurchaseUnit: unitsPerUnit,
      minimumOrderQuantity,
      leadTimeDays,
      isPreferred,
      status: "active",
      notes: "",
      productName,
      variantName: sku.variantName,
      sku: sku.sku,
      barcode: sku.barcode,
    };
    await commitLocalChange({
      entityType: "vendor_sku",
      entityId: localId,
      operation: "UPSERT",
      payload: row as unknown as Record<string, unknown>,
    });
    void syncNow();
    return { row, cacheWarning: false };
  }

  row = await vendorSkusApi.create({
    vendorId,
    productSkuId: sku.id,
    vendorSkuCode: null,
    purchasePrice: price,
    purchaseUnitId: sku.purchaseUnitId,
    unitsPerPurchaseUnit: unitsPerUnit,
    minimumOrderQuantity,
    leadTimeDays,
    isPreferred,
    notes: "",
  });
  row = {
    ...row,
    productName,
    variantName: sku.variantName,
    sku: sku.sku,
    barcode: sku.barcode,
  };

  let cacheWarning = false;
  try {
    await window.blackbox?.localDb?.upsertVendorSku(row);
  } catch {
    cacheWarning = true;
  }
  return { row, cacheWarning };
}
