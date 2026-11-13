import type {
  GoodsReceiptDetail,
  InventoryOutDetail,
  VendorReturnDetail,
  PurchaseOrderDetail,
  SkuBarcode,
  SyncCatalogDocumentKind,
  SyncCatalogPage,
  VendorDetail,
  VendorSku,
} from "@blackbox/shared";
import { SYNC_CATALOG_PAGE_SIZE } from "@blackbox/shared";
import { brandsApi } from "@renderer/lib/api/brands";
import { categoriesApi } from "@renderer/lib/api/categories";
import { ApiError, getApiErrorMessage } from "@renderer/lib/api/client";
import { inventoryMovementsApi } from "@renderer/lib/api/inventory-movements";
import { getAccessToken } from "@renderer/lib/api/session";
import { syncApi } from "@renderer/lib/api/sync";
import { unitsApi } from "@renderer/lib/api/units";
import { vendorGroupsApi } from "@renderer/lib/api/vendor-groups";
import { warehousesApi } from "@renderer/lib/api/warehouses";
import { bumpDataVersion } from "@renderer/lib/sync/sync-status";
import { seedEntityVersionHeadsFromCloud } from "@renderer/lib/sync/entity-version-seed";

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

type LocalDbBridge = ReturnType<typeof requireLocalDb>;
type ProgressReporter = (
  phase: SyncPhase,
  done: number,
  total: number,
  message: string,
) => void;

export const CATALOG_PULL_ACTIVE_KEY = "catalog_pull_active";

const CATALOG_PAGE_KEYS = {
  reference: "catalog_reference_done",
  products: "catalog_products_next_page",
  vendors: "catalog_vendors_next_page",
  stock: "catalog_stock_next_page",
  purchaseOrders: "catalog_purchase_orders_next_page",
  goodsReceipts: "catalog_goods_receipts_next_page",
  inventoryOuts: "catalog_inventory_outs_next_page",
  vendorReturns: "catalog_vendor_returns_next_page",
  movements: "catalog_movements_next_page",
} as const;

type PagePullOptions = {
  resume?: boolean;
  persist?: boolean;
};

async function readSavedPage(
  key: string,
  options?: PagePullOptions,
): Promise<number | "done"> {
  if (!options?.persist || !options.resume) return 1;
  const raw = await window.blackbox?.localDb?.getSyncMeta(key);
  if (raw === "done") return "done";
  const page = Number(raw);
  return Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
}

async function writeSavedPage(
  key: string,
  value: string,
  options?: PagePullOptions,
): Promise<void> {
  if (!options?.persist) return;
  await window.blackbox?.localDb?.setSyncMeta(key, value);
}

async function forEachCatalogPage<T>(
  key: string,
  options: PagePullOptions | undefined,
  fetchPage: (page: number) => Promise<SyncCatalogPage<T>>,
  apply: (page: SyncCatalogPage<T>) => Promise<void>,
  reportPage: (done: number, total: number) => void,
): Promise<void> {
  const start = await readSavedPage(key, options);
  if (start === "done") return;
  let page = start;
  while (true) {
    await writeSavedPage(key, String(page), options);
    const result = await fetchPage(page);
    if (result.items.length > 0) await apply(result);
    const done = Math.min(page * result.pageSize, result.total);
    reportPage(done, result.total);
    if (result.items.length === 0 || page * result.pageSize >= result.total) {
      await writeSavedPage(key, "done", options);
      return;
    }
    page += 1;
  }
}

async function saveBarcodes(barcodes: SkuBarcode[]): Promise<void> {
  const save = window.blackbox?.localDb?.upsertSkuBarcode;
  if (!save) return;
  for (const barcode of barcodes) {
    await save(barcode);
  }
}

async function pullProductsSection(
  localDb: LocalDbBridge,
  report: ProgressReporter,
  options?: PagePullOptions,
): Promise<void> {
  await forEachCatalogPage(
    CATALOG_PAGE_KEYS.products,
    options,
    (page) => syncApi.catalogProducts(page),
    async (result) => {
      await localDb.upsertProducts(result.items.map((row) => row.product));
      const skus = result.items.flatMap((row) => row.skus);
      if (skus.length > 0) await localDb.upsertProductSkus(skus);
      await saveBarcodes(result.items.flatMap((row) => row.barcodes));
      bumpDataVersion();
    },
    (done, total) => {
      report(
        "products",
        Math.max(done, total === 0 ? 1 : done),
        Math.max(total, 1),
        total === 0
          ? "No products to sync"
          : `Updating catalog… ${done}/${total}`,
      );
    },
  );
}

async function pullVendorsSection(
  localDb: LocalDbBridge,
  report: ProgressReporter,
  options?: PagePullOptions,
): Promise<void> {
  await forEachCatalogPage(
    CATALOG_PAGE_KEYS.vendors,
    options,
    (page) => syncApi.catalogVendors(page),
    async (result) => {
      const details: VendorDetail[] = result.items.map((row) => row.vendor);
      const links: VendorSku[] = result.items.flatMap((row) => row.links);
      if (details.length > 0) await localDb.upsertVendors(details);
      if (links.length > 0) await localDb.upsertVendorSkus(links);
    },
    (done, total) => {
      report(
        "vendors",
        Math.max(done, total === 0 ? 1 : done),
        Math.max(total, 1),
        total === 0 ? "No vendors to sync" : `Updating vendors… ${done}/${total}`,
      );
    },
  );
}

export async function runMasterDataImportPull(
  importedFiles: string[],
  onProgress?: (progress: SyncProgress) => void,
): Promise<{ lastSyncedAt: string }> {
  const localDb = requireLocalDb();
  const files = new Set(importedFiles);
  const report: ProgressReporter = (phase, done, total, message) => {
    onProgress?.({ phase, done, total, message });
  };

  try {
    if (files.has("01_units.csv")) {
      report("reference", 0, 1, "Syncing units…");
      await localDb.upsertUnits(await unitsApi.list());
      report("reference", 1, 1, "Units saved");
    }
    if (files.has("02_brands.csv")) {
      report("reference", 0, 1, "Syncing brands…");
      await localDb.upsertBrands(await brandsApi.list({ status: "all" }));
      report("reference", 1, 1, "Brands saved");
    }
    if (files.has("03_categories.csv")) {
      report("reference", 0, 1, "Syncing categories…");
      await localDb.upsertCategories(await categoriesApi.list({ status: "all" }));
      report("reference", 1, 1, "Categories saved");
    }
    if (files.has("04_warehouses.csv")) {
      report("reference", 0, 1, "Syncing warehouses…");
      await localDb.upsertWarehouses(await warehousesApi.list({ status: "all" }));
      report("reference", 1, 1, "Warehouses saved");
    }
    if (files.has("05_vendor_groups.csv")) {
      report("reference", 0, 1, "Syncing vendor groups…");
      await localDb.upsertVendorGroups(
        await vendorGroupsApi.list({ status: "all" }),
      );
      report("reference", 1, 1, "Vendor groups saved");
    }
  } catch (err: unknown) {
    if (err instanceof SyncPullError) throw err;
    throw new SyncPullError(
      "reference",
      getApiErrorMessage(err, "Failed to sync imported reference data"),
    );
  }

  if (files.has("06_products.csv") || files.has("07_product_skus.csv")) {
    try {
      await pullProductsSection(localDb, report);
    } catch (err: unknown) {
      if (err instanceof SyncPullError) throw err;
      throw new SyncPullError(
        "products",
        getApiErrorMessage(err, "Failed to sync products"),
      );
    }
  }

  if (files.has("08_vendors.csv") || files.has("09_vendor_skus.csv")) {
    try {
      await pullVendorsSection(localDb, report);
    } catch (err: unknown) {
      if (err instanceof SyncPullError) throw err;
      throw new SyncPullError(
        "vendors",
        getApiErrorMessage(err, "Failed to sync vendors"),
      );
    }
  }

  const lastSyncedAt = new Date().toISOString();
  await localDb.setSyncMeta(LAST_FULL_PULL_AT_KEY, lastSyncedAt);
  await seedEntityVersionHeadsFromCloud().catch(() => undefined);
  report("done", 1, 1, "Import sync complete");
  return { lastSyncedAt };
}

export async function runFullPull(
  onProgress?: (progress: SyncProgress) => void,
  options?: { resume?: boolean },
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
  const pageOptions: PagePullOptions = {
    resume: options?.resume === true,
    persist: true,
  };

  try {
    const referenceSaved = await readSavedPage(
      CATALOG_PAGE_KEYS.reference,
      pageOptions,
    );
    if (referenceSaved !== "done") {
      report("reference", 0, 1, "Syncing reference data…");
      await writeSavedPage(CATALOG_PAGE_KEYS.reference, "1", pageOptions);
      const reference = await syncApi.catalogReference();
      await localDb.upsertUnits(reference.units);
      await localDb.upsertBrands(reference.brands);
      await localDb.upsertCategories(reference.categories);
      await localDb.upsertVendorGroups(reference.vendorGroups);
      await localDb.upsertWarehouses(reference.warehouses);
      await writeSavedPage(CATALOG_PAGE_KEYS.reference, "done", pageOptions);
      report("reference", 1, 1, "Reference data saved");
    }
  } catch (err: unknown) {
    if (err instanceof SyncPullError) throw err;
    throw new SyncPullError(
      "reference",
      getApiErrorMessage(err, "Failed to sync reference data"),
    );
  }

  try {
    await pullProductsSection(localDb, report, pageOptions);
  } catch (err: unknown) {
    if (err instanceof SyncPullError) throw err;
    throw new SyncPullError(
      "products",
      getApiErrorMessage(err, "Failed to sync products"),
    );
  }

  try {
    await pullVendorsSection(localDb, report, pageOptions);
  } catch (err: unknown) {
    if (err instanceof SyncPullError) throw err;
    throw new SyncPullError(
      "vendors",
      getApiErrorMessage(err, "Failed to sync vendors"),
    );
  }

  try {
    await forEachCatalogPage(
      CATALOG_PAGE_KEYS.stock,
      pageOptions,
      (page) => syncApi.catalogStock(page),
      async (result) => {
        if (result.items.length > 0) await localDb.upsertStockRows(result.items);
      },
      (done, total) => {
        report(
          "stock",
          Math.max(done, total === 0 ? 1 : done),
          Math.max(total, 1),
          total === 0 ? "No stock rows to sync" : `Updating stock… ${done}/${total}`,
        );
      },
    );
  } catch (err: unknown) {
    if (err instanceof SyncPullError) throw err;
    throw new SyncPullError(
      "stock",
      getApiErrorMessage(err, "Failed to sync stock"),
    );
  }

  await pullDocumentSection(
    report,
    pageOptions,
    "purchaseOrders",
    "purchaseOrders",
    "purchase orders",
    (rows) => localDb.upsertPurchaseOrders(rows),
  );
  await pullDocumentSection(
    report,
    pageOptions,
    "goodsReceipts",
    "goodsReceipts",
    "goods receipts",
    (rows) => localDb.upsertGoodsReceipts(rows),
  );
  await pullDocumentSection(
    report,
    pageOptions,
    "inventoryOut",
    "inventoryOuts",
    "inventory outs",
    (rows) => localDb.upsertInventoryOuts(rows),
  );
  await pullDocumentSection(
    report,
    pageOptions,
    "vendorReturns",
    "vendorReturns",
    "vendor returns",
    async (rows) => {
      await localDb.upsertVendorReturns?.(rows);
    },
  );

  try {
    await forEachCatalogPage(
      CATALOG_PAGE_KEYS.movements,
      { persist: false },
      (page) =>
        inventoryMovementsApi.list({
          page,
          pageSize: SYNC_CATALOG_PAGE_SIZE,
        }),
      async (result) => {
        if (result.items.length > 0) {
          await localDb.upsertInventoryMovements(result.items);
        }
      },
      (done, total) => {
        report(
          "movements",
          Math.max(done, total === 0 ? 1 : done),
          Math.max(total, 1),
          total === 0
            ? "No movements to sync"
            : `Updating movements… ${done}/${total}`,
        );
      },
    );
  } catch (err: unknown) {
    if (err instanceof ApiError && err.status === 403) {
      // #region agent log
      fetch("http://127.0.0.1:7686/ingest/ab68d8f7-59f7-4472-9baa-3354161bb732",{method:"POST",headers:{"Content-Type":"application/json","X-Debug-Session-Id":"abae79"},body:JSON.stringify({sessionId:"abae79",runId:"run1",hypothesisId:"B",location:"pull.ts:movements",message:"movements 403 skipped",data:{status:err.status},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      report("movements", 1, 1, "Skipping movement history");
    } else if (err instanceof SyncPullError) {
      throw err;
    } else {
      throw new SyncPullError(
        "movements",
        getApiErrorMessage(err, "Failed to sync inventory movements"),
      );
    }
  }

  try {
    report("movements", 1, 1, "Rebuilding POS balance from synced documents…");
    await localDb.rebuildPosBalanceFromDocuments?.();
    // #region agent log
    fetch("http://127.0.0.1:7686/ingest/ab68d8f7-59f7-4472-9baa-3354161bb732",{method:"POST",headers:{"Content-Type":"application/json","X-Debug-Session-Id":"abae79"},body:JSON.stringify({sessionId:"abae79",runId:"run1",hypothesisId:"C",location:"pull.ts:rebuild",message:"pos rebuild invoked",data:{},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
  } catch (err: unknown) {
    throw new SyncPullError(
      "movements",
      getApiErrorMessage(err, "Failed to rebuild POS balance"),
    );
  }

  try {
    await finalizeCatalogCursors();
  } catch (err: unknown) {
    throw new SyncPullError(
      "done",
      getApiErrorMessage(err, "Failed to finish catalog sync"),
    );
  }

  const lastSyncedAt = new Date().toISOString();
  await localDb.setSyncMeta(LAST_FULL_PULL_AT_KEY, lastSyncedAt);
  report("done", 1, 1, "Sync complete");
  return { lastSyncedAt };
}

async function pullDocumentSection<T extends SyncCatalogDocumentKind>(
  report: ProgressReporter,
  options: PagePullOptions,
  phase: SyncPhase,
  kind: T,
  label: string,
  save: (rows: DocumentRow[T][]) => Promise<unknown>,
): Promise<void> {
  try {
    await forEachCatalogPage(
      CATALOG_PAGE_KEYS[kind],
      options,
      (page) => syncApi.catalogDocuments<DocumentRow[T]>(kind, page),
      async (result) => {
        if (result.items.length > 0) await save(result.items);
      },
      (done, total) => {
        report(
          phase,
          Math.max(done, total === 0 ? 1 : done),
          Math.max(total, 1),
          total === 0
            ? `No ${label} to sync`
            : `Updating ${label}… ${done}/${total}`,
        );
      },
    );
  } catch (err: unknown) {
    if (err instanceof SyncPullError) throw err;
    throw new SyncPullError(
      phase,
      getApiErrorMessage(err, `Failed to sync ${label}`),
    );
  }
}

type DocumentRow = {
  purchaseOrders: PurchaseOrderDetail;
  goodsReceipts: GoodsReceiptDetail;
  inventoryOuts: InventoryOutDetail;
  vendorReturns: VendorReturnDetail;
};

async function finalizeCatalogCursors(): Promise<void> {
  if (!getAccessToken()) {
    throw new Error("Sign in to finish catalog sync");
  }
  const status = await syncApi.status();
  for (const stream of status.streams) {
    await window.blackbox?.sync?.applyPull({
      changes: [],
      nextCursor: stream.serverSeq,
      stream: stream.stream,
    });
  }
  await syncApi.completeFullResync();
  await seedEntityVersionHeadsFromCloud();
}

