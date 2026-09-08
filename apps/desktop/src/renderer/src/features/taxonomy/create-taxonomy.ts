import type { Brand, Category, VendorGroup } from "@blackbox/shared";
import {
  normalizeOptionalStoredText,
  normalizeStoredText,
} from "@blackbox/shared";
import { brandsApi } from "@renderer/lib/api/brands";
import { categoriesApi } from "@renderer/lib/api/categories";
import { vendorGroupsApi } from "@renderer/lib/api/vendor-groups";
import { commitLocalChange, isDeviceBound } from "@renderer/lib/local-db/local-write";
import { syncNow } from "@renderer/lib/sync/sync-status";

export type TaxonomyKind = "brand" | "category" | "vendor_group";

export type TaxonomyRow = Brand | Category | VendorGroup;

export type CreateTaxonomyInput = {
  name: string;
  description?: string;
};

function buildRow(kind: TaxonomyKind, localId: string, body: {
  name: string;
  description: string;
  status: "active";
}): TaxonomyRow {
  if (kind === "brand") {
    return { id: localId, ...body } satisfies Brand;
  }
  if (kind === "category") {
    return { id: localId, ...body } satisfies Category;
  }
  return { id: localId, ...body } satisfies VendorGroup;
}

export async function createTaxonomy(
  kind: TaxonomyKind,
  input: CreateTaxonomyInput,
): Promise<{ row: TaxonomyRow; cacheWarning: boolean }> {
  const name = normalizeStoredText(input.name);
  const description = normalizeOptionalStoredText(input.description);
  const body = { name, description, status: "active" as const };

  if (await isDeviceBound()) {
    const localId = crypto.randomUUID();
    const row = buildRow(kind, localId, body);
    await commitLocalChange({
      entityType: kind,
      entityId: localId,
      operation: "UPSERT",
      payload: row as unknown as Record<string, unknown>,
    });
    void syncNow();
    return { row, cacheWarning: false };
  }

  const row =
    kind === "brand"
      ? await brandsApi.create(body)
      : kind === "category"
        ? await categoriesApi.create(body)
        : await vendorGroupsApi.create(body);

  let cacheWarning = false;
  try {
    if (kind === "brand") {
      await window.blackbox?.localDb?.upsertBrands?.([row as Brand]);
    } else if (kind === "category") {
      await window.blackbox?.localDb?.upsertCategories?.([row as Category]);
    } else {
      await window.blackbox?.localDb?.upsertVendorGroups?.([row as VendorGroup]);
    }
  } catch {
    cacheWarning = true;
  }

  return { row, cacheWarning };
}
