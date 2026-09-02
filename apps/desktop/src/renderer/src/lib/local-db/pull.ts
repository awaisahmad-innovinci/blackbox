import type {
  GoodsReceiptDetail,
  InventoryMovementListItem,
  InventoryOutDetail,
  VendorReturnDetail,
  ProductDetail,
  ProductSkuDetail,
  PurchaseOrderDetail,
  VendorDetail,
  VendorSku,
  WarehouseStockRow,
} from "@blackbox/shared";
import { brandsApi } from "@renderer/lib/api/brands";
import { categoriesApi } from "@renderer/lib/api/categories";
import { getApiErrorMessage } from "@renderer/lib/api/client";
import { goodsReceiptsApi } from "@renderer/lib/api/goods-receipts";
import { inventoryMovementsApi } from "@renderer/lib/api/inventory-movements";
import { inventoryOutApi } from "@renderer/lib/api/inventory-out";
import { vendorReturnsApi } from "@renderer/lib/api/vendor-returns";
import { productsApi } from "@renderer/lib/api/products";
import { purchaseOrdersApi } from "@renderer/lib/api/purchase-orders";
import { skusApi } from "@renderer/lib/api/skus";
import { unitsApi } from "@renderer/lib/api/units";
import { vendorGroupsApi } from "@renderer/lib/api/vendor-groups";
import { vendorSkusApi } from "@renderer/lib/api/vendor-skus";
import { vendorsApi } from "@renderer/lib/api/vendors";
import { warehousesApi } from "@renderer/lib/api/warehouses";

export const LAST_FULL_PULL_AT_KEY = "last_full_pull_at";

export type SyncPhase =
  | "reference"
  | "products"
  | "vendors"
  | "purchaseOrders"
  | "stock"
  | "goodsReceipts"
  | "inventoryOut"
  | "vendorReturns"
  | "movements"
  | "done";

export type SyncProgress = {
  phase: SyncPhase;
  done: number;
  total: number;
  message: string;
};

export class SyncPullError extends Error {
  constructor(
    readonly phase: SyncPhase,
    message: string,
  ) {
    super(message);
    this.name = "SyncPullError";
  }
}

function requireLocalDb() {
  const localDb = window.blackbox?.localDb;
  if (
    !localDb?.upsertBrands ||
    !localDb.upsertStockRows ||
    !localDb.upsertGoodsReceipts ||
    !localDb.upsertInventoryOuts ||
    !localDb.upsertInventoryMovements ||
    !localDb.setSyncMeta
  ) {
    throw new SyncPullError(
      "reference",
      "Local database bridge is not available. Use the Electron desktop window.",
    );
  }
  return localDb;
}

async function paginateAll<T>(
  fetchPage: (
    page: number,
    pageSize: number,
  ) => Promise<{
    items: T[];
    total: number;
  }>,
  pageSize = 100,
): Promise<T[]> {
  const first = await fetchPage(1, pageSize);
  const items = [...first.items];
  const totalPages = Math.max(1, Math.ceil(first.total / pageSize));
  for (let page = 2; page <= totalPages; page += 1) {
    const next = await fetchPage(page, pageSize);
    items.push(...next.items);
  }
  return items;
}

export async function runFullPull(
  onProgress?: (progress: SyncProgress) => void,
): Promise<{ lastSyncedAt: string }> {
  const localDb = requireLocalDb();
  const report = (
    phase: SyncPhase,
    done: number,
    total: number,
    message: string,
  ) => {
    onProgress?.({ phase, done, total, message });
  };

  try {
    report("reference", 0, 5, "Syncing reference data…");
    const [units, brands, categories, vendorGroups, warehouses] =
      await Promise.all([
        unitsApi.list(),
        brandsApi.list({ status: "all" }),
        categoriesApi.list({ status: "all" }),
        vendorGroupsApi.list({ status: "all" }),
        warehousesApi.list({ status: "all" }),
      ]);
    await localDb.upsertUnits(units);
    report("reference", 1, 5, "Units saved");
    await localDb.upsertBrands(brands);
    report("reference", 2, 5, "Brands saved");
    await localDb.upsertCategories(categories);
    report("reference", 3, 5, "Categories saved");
    await localDb.upsertVendorGroups(vendorGroups);
    report("reference", 4, 5, "Vendor groups saved");
    await localDb.upsertWarehouses(warehouses);
    report("reference", 5, 5, "Warehouses saved");
  } catch (err: unknown) {
    if (err instanceof SyncPullError) throw err;
    throw new SyncPullError(
      "reference",
      getApiErrorMessage(err, "Failed to sync reference data"),
    );
  }

  const skuIds = new Set<string>();

  try {
    const productList = await paginateAll((page, pageSize) =>
      productsApi.list({ page, pageSize }),
    );
    report("products", 0, Math.max(productList.length, 1), "Syncing products…");
    const details: ProductDetail[] = [];
    const skus: ProductSkuDetail[] = [];

    for (let i = 0; i < productList.length; i += 1) {
      const id = productList[i]!.id;
      const [detail, productSkus] = await Promise.all([
        productsApi.get(id),
        productsApi.listSkus(id),
      ]);
      details.push(detail);
      skus.push(...productSkus);
      for (const sku of productSkus) skuIds.add(sku.id);
      report(
        "products",
        i + 1,
        productList.length,
        `Syncing products… ${i + 1}/${productList.length}`,
      );

      if (details.length >= 25) {
        await localDb.upsertProducts(details.splice(0, details.length));
      }
      if (skus.length >= 50) {
        await localDb.upsertProductSkus(skus.splice(0, skus.length));
      }
    }
    if (details.length > 0) await localDb.upsertProducts(details);
    if (skus.length > 0) await localDb.upsertProductSkus(skus);
    if (productList.length === 0) {
      report("products", 1, 1, "No products to sync");
    }
  } catch (err: unknown) {
    if (err instanceof SyncPullError) throw err;
    throw new SyncPullError(
      "products",
      getApiErrorMessage(err, "Failed to sync products"),
    );
  }

  try {
    const vendorList = await paginateAll((page, pageSize) =>
      vendorsApi.list({ status: "all", page, pageSize }),
    );
    report("vendors", 0, Math.max(vendorList.length, 1), "Syncing vendors…");
    const details: VendorDetail[] = [];
    const links: VendorSku[] = [];

    for (let i = 0; i < vendorList.length; i += 1) {
      const id = vendorList[i]!.id;
      const [detail, vendorLinks] = await Promise.all([
        vendorsApi.get(id),
        vendorSkusApi.listByVendor(id),
      ]);
      details.push(detail);
      links.push(...vendorLinks);
      for (const link of vendorLinks) skuIds.add(link.productSkuId);
      report(
        "vendors",
        i + 1,
        vendorList.length,
        `Syncing vendors… ${i + 1}/${vendorList.length}`,
      );

      if (details.length >= 25) {
        await localDb.upsertVendors(details.splice(0, details.length));
      }
      if (links.length >= 50) {
        await localDb.upsertVendorSkus(links.splice(0, links.length));
      }
    }
    if (details.length > 0) await localDb.upsertVendors(details);
    if (links.length > 0) await localDb.upsertVendorSkus(links);
    if (vendorList.length === 0) {
      report("vendors", 1, 1, "No vendors to sync");
    }
  } catch (err: unknown) {
    if (err instanceof SyncPullError) throw err;
    throw new SyncPullError(
      "vendors",
      getApiErrorMessage(err, "Failed to sync vendors"),
    );
  }

  try {
    const poList = await paginateAll((page, pageSize) =>
      purchaseOrdersApi.list({ page, pageSize }),
    );
    report(
      "purchaseOrders",
      0,
      Math.max(poList.length, 1),
      "Syncing purchase orders…",
    );
    const details: PurchaseOrderDetail[] = [];

    for (let i = 0; i < poList.length; i += 1) {
      const detail = await purchaseOrdersApi.get(poList[i]!.id);
      details.push(detail);
      for (const item of detail.items) skuIds.add(item.productSkuId);
      report(
        "purchaseOrders",
        i + 1,
        poList.length,
        `Syncing purchase orders… ${i + 1}/${poList.length}`,
      );
      if (details.length >= 20) {
        await localDb.upsertPurchaseOrders(details.splice(0, details.length));
      }
    }
    if (details.length > 0) await localDb.upsertPurchaseOrders(details);
    if (poList.length === 0) {
      report("purchaseOrders", 1, 1, "No purchase orders to sync");
    }
  } catch (err: unknown) {
    if (err instanceof SyncPullError) throw err;
    throw new SyncPullError(
      "purchaseOrders",
      getApiErrorMessage(err, "Failed to sync purchase orders"),
    );
  }

  try {
    const ids = Array.from(skuIds);
    report("stock", 0, Math.max(ids.length, 1), "Syncing stock…");
    const buffer: WarehouseStockRow[] = [];

    for (let i = 0; i < ids.length; i += 1) {
      const rows = await skusApi.listInventory(ids[i]!);
      buffer.push(...rows);
      report(
        "stock",
        i + 1,
        ids.length,
        `Syncing stock… ${i + 1}/${ids.length}`,
      );
      if (buffer.length >= 100) {
        await localDb.upsertStockRows(buffer.splice(0, buffer.length));
      }
    }
    if (buffer.length > 0) await localDb.upsertStockRows(buffer);
    if (ids.length === 0) {
      report("stock", 1, 1, "No stock rows to sync");
    }
  } catch (err: unknown) {
    if (err instanceof SyncPullError) throw err;
    throw new SyncPullError(
      "stock",
      getApiErrorMessage(err, "Failed to sync stock"),
    );
  }

  try {
    const grList = await paginateAll((page, pageSize) =>
      goodsReceiptsApi.list({ page, pageSize }),
    );
    report(
      "goodsReceipts",
      0,
      Math.max(grList.length, 1),
      "Syncing goods receipts…",
    );
    const details: GoodsReceiptDetail[] = [];

    for (let i = 0; i < grList.length; i += 1) {
      const detail = await goodsReceiptsApi.get(grList[i]!.id);
      details.push(detail);
      report(
        "goodsReceipts",
        i + 1,
        grList.length,
        `Syncing goods receipts… ${i + 1}/${grList.length}`,
      );
      if (details.length >= 20) {
        await localDb.upsertGoodsReceipts(details.splice(0, details.length));
      }
    }
    if (details.length > 0) await localDb.upsertGoodsReceipts(details);
    if (grList.length === 0) {
      report("goodsReceipts", 1, 1, "No goods receipts to sync");
    }
  } catch (err: unknown) {
    if (err instanceof SyncPullError) throw err;
    throw new SyncPullError(
      "goodsReceipts",
      getApiErrorMessage(err, "Failed to sync goods receipts"),
    );
  }

  try {
    const outList = await paginateAll((page, pageSize) =>
      inventoryOutApi.list({ page, pageSize }),
    );
    report(
      "inventoryOut",
      0,
      Math.max(outList.length, 1),
      "Syncing inventory out…",
    );
    const details: InventoryOutDetail[] = [];

    for (let i = 0; i < outList.length; i += 1) {
      const detail = await inventoryOutApi.get(outList[i]!.id);
      details.push(detail);
      report(
        "inventoryOut",
        i + 1,
        outList.length,
        `Syncing inventory out… ${i + 1}/${outList.length}`,
      );
      if (details.length >= 20) {
        await localDb.upsertInventoryOuts(details.splice(0, details.length));
      }
    }
    if (details.length > 0) await localDb.upsertInventoryOuts(details);
    if (outList.length === 0) {
      report("inventoryOut", 1, 1, "No inventory outs to sync");
    }
  } catch (err: unknown) {
    if (err instanceof SyncPullError) throw err;
    throw new SyncPullError(
      "inventoryOut",
      getApiErrorMessage(err, "Failed to sync inventory out"),
    );
  }

  try {
    const returnList = await paginateAll((page, pageSize) =>
      vendorReturnsApi.list({ page, pageSize }),
    );
    report(
      "vendorReturns",
      0,
      Math.max(returnList.length, 1),
      "Syncing vendor returns…",
    );
    const details: VendorReturnDetail[] = [];
    for (let i = 0; i < returnList.length; i += 1) {
      const detail = await vendorReturnsApi.get(returnList[i]!.id);
      details.push(detail);
      report(
        "vendorReturns",
        i + 1,
        returnList.length,
        `Syncing vendor returns… ${i + 1}/${returnList.length}`,
      );
      if (details.length >= 20) {
        await localDb.upsertVendorReturns?.(details.splice(0, details.length));
      }
    }
    if (details.length > 0) await localDb.upsertVendorReturns?.(details);
    if (returnList.length === 0) {
      report("vendorReturns", 1, 1, "No vendor returns to sync");
    }
  } catch (err: unknown) {
    if (err instanceof SyncPullError) throw err;
    throw new SyncPullError(
      "vendorReturns",
      getApiErrorMessage(err, "Failed to sync vendor returns"),
    );
  }

  try {
    const movementList = await paginateAll((page, pageSize) =>
      inventoryMovementsApi.list({ page, pageSize }),
    );
    report(
      "movements",
      0,
      Math.max(movementList.length, 1),
      "Syncing movements…",
    );
    const buffer: InventoryMovementListItem[] = [];

    for (let i = 0; i < movementList.length; i += 1) {
      buffer.push(movementList[i]!);
      report(
        "movements",
        i + 1,
        movementList.length,
        `Syncing movements… ${i + 1}/${movementList.length}`,
      );
      if (buffer.length >= 100) {
        await localDb.upsertInventoryMovements(
          buffer.splice(0, buffer.length),
        );
      }
    }
    if (buffer.length > 0) await localDb.upsertInventoryMovements(buffer);
    if (movementList.length === 0) {
      report("movements", 1, 1, "No movements to sync");
    }
  } catch (err: unknown) {
    if (err instanceof SyncPullError) throw err;
    throw new SyncPullError(
      "movements",
      getApiErrorMessage(err, "Failed to sync inventory movements"),
    );
  }

  const lastSyncedAt = new Date().toISOString();
  await localDb.setSyncMeta(LAST_FULL_PULL_AT_KEY, lastSyncedAt);
  report("done", 1, 1, "Sync complete");
  return { lastSyncedAt };
}
