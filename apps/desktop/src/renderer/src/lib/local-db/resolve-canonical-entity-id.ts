import type { SyncEntityType } from "@blackbox/shared";

export type ResolveCanonicalEntityInput = {
  entityType: SyncEntityType;
  vendorCode?: string;
  name?: string;
  sku?: string;
  abbreviation?: string;
  warehouseCode?: string;
  importKey?: string;
  productCode?: string;
  vendorId?: string;
  productSkuId?: string;
};

export async function resolveCanonicalEntityId(
  input: ResolveCanonicalEntityInput,
): Promise<string | null> {
  const resolve = window.blackbox?.localDb?.resolveCanonicalEntityId;
  if (!resolve) return null;
  return resolve(input);
}
