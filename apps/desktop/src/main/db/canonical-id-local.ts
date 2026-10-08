import type { SyncEntityType } from "@blackbox/shared";
import { normalizeStoredText } from "@blackbox/shared";
import { getLocalDb } from "./index";

export type CanonicalEntityLookup = {
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

function rowId(
  sql: string,
  params: Record<string, unknown>,
): string | null {
  const row = getLocalDb()
    .prepare(sql)
    .get(params) as { id: string } | undefined;
  return row?.id ?? null;
}

export function resolveCanonicalEntityId(
  input: CanonicalEntityLookup,
): string | null {
  switch (input.entityType) {
    case "vendor":
      if (!input.vendorCode?.trim()) return null;
      return rowId(
        `select id from vendors where tenant_id = @tenantId and vendor_code = @code limit 1`,
        {
          tenantId: "a0000000-0000-4000-8000-000000000001",
          code: input.vendorCode.trim(),
        },
      );
    case "brand":
      if (!input.name?.trim()) return null;
      return rowId(
        `select id from brands where tenant_id = @tenantId and lower(name) = lower(@name) limit 1`,
        {
          tenantId: "a0000000-0000-4000-8000-000000000001",
          name: normalizeStoredText(input.name),
        },
      );
    case "category":
      if (!input.name?.trim()) return null;
      return rowId(
        `select id from categories where tenant_id = @tenantId and lower(name) = lower(@name) limit 1`,
        {
          tenantId: "a0000000-0000-4000-8000-000000000001",
          name: normalizeStoredText(input.name),
        },
      );
    case "vendor_group":
      if (!input.name?.trim()) return null;
      return rowId(
        `select id from vendor_groups where tenant_id = @tenantId and lower(name) = lower(@name) limit 1`,
        {
          tenantId: "a0000000-0000-4000-8000-000000000001",
          name: normalizeStoredText(input.name),
        },
      );
    case "unit":
      if (!input.abbreviation?.trim()) return null;
      return rowId(
        `select id from units where tenant_id = @tenantId and abbreviation = @abbreviation limit 1`,
        {
          tenantId: "a0000000-0000-4000-8000-000000000001",
          abbreviation: input.abbreviation.trim(),
        },
      );
    case "warehouse":
      if (!input.warehouseCode?.trim()) return null;
      return rowId(
        `select id from warehouses where tenant_id = @tenantId and code = @code limit 1`,
        {
          tenantId: "a0000000-0000-4000-8000-000000000001",
          code: input.warehouseCode.trim(),
        },
      );
    case "product_sku":
      if (!input.sku?.trim()) return null;
      return rowId(
        `select id from product_skus where tenant_id = @tenantId and sku = @sku limit 1`,
        {
          tenantId: "a0000000-0000-4000-8000-000000000001",
          sku: input.sku.trim(),
        },
      );
    case "product": {
      if (input.importKey?.trim()) {
        const byKey = rowId(
          `select id from products where tenant_id = @tenantId and import_key = @importKey limit 1`,
          {
            tenantId: "a0000000-0000-4000-8000-000000000001",
            importKey: input.importKey.trim(),
          },
        );
        if (byKey) return byKey;
      }
      if (input.productCode?.trim()) {
        return rowId(
          `select id from products where tenant_id = @tenantId and product_code = @productCode limit 1`,
          {
            tenantId: "a0000000-0000-4000-8000-000000000001",
            productCode: input.productCode.trim(),
          },
        );
      }
      return null;
    }
    case "vendor_sku":
      if (!input.vendorId || !input.productSkuId) return null;
      return rowId(
        `select id from vendor_skus
         where tenant_id = @tenantId and vendor_id = @vendorId and product_sku_id = @productSkuId
         limit 1`,
        {
          tenantId: "a0000000-0000-4000-8000-000000000001",
          vendorId: input.vendorId,
          productSkuId: input.productSkuId,
        },
      );
    default:
      return null;
  }
}
