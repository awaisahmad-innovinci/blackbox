import { app, BrowserWindow, ipcMain, shell } from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type {
  Brand,
  Category,
  EntityStatus,
  GoodsReceiptDetail,
  InventoryMovementListItem,
  InventoryOutDetail,
  ProductDetail,
  ProductListQuery,
  ProductSkuDetail,
  PurchaseOrderDetail,
  PurchaseOrderListQuery,
  UnitListItem,
  VendorDetail,
  VendorGroup,
  VendorListQuery,
  VendorSku,
  WarehouseListItem,
  WarehouseStockRow,
} from "@blackbox/shared";
import {
  closeLocalDb,
  getLocalDbStatus,
  initLocalDb,
  recordLocalDbInitError,
} from "./db";
import {
  upsertGoodsReceiptLocal,
  upsertGoodsReceiptsLocal,
} from "./db/goods-receipts-local";
import {
  upsertInventoryOutLocal,
  upsertInventoryOutsLocal,
} from "./db/inventory-out-local";
import { upsertInventoryMovementsLocal } from "./db/movements-local";
import {
  upsertProductLocal,
  upsertProductSkuLocal,
  upsertProductSkusLocal,
  upsertProductsLocal,
} from "./db/products-local";
import {
  upsertPurchaseOrderLocal,
  upsertPurchaseOrdersLocal,
} from "./db/purchase-orders-local";
import { upsertStockRowsLocal } from "./db/stock-local";
import { getSyncMeta, setSyncMeta } from "./db/sync-meta";
import {
  upsertBrandsLocal,
  upsertCategoriesLocal,
  upsertUnitsLocal,
  upsertVendorGroupsLocal,
} from "./db/taxonomy-local";
import {
  deactivateVendorSkuLocal,
  upsertVendorLocal,
  upsertVendorSkuLocal,
  upsertVendorSkusLocal,
  upsertVendorsLocal,
} from "./db/vendors-local";
import {
  getDashboardSummaryLocal,
  listBrandsLocal,
  listCategoriesLocal,
  listProductsLocal,
  listPurchaseOrdersLocal,
  listVendorGroupsLocal,
  listVendorsLocal,
  listWarehousesLocal,
} from "./db/queries-local";
import { upsertWarehousesLocal } from "./db/warehouses-local";

function createWindow(): void {
  const preloadPath = join(__dirname, "../preload/index.js");
  console.log(
    `[preload] path=${preloadPath} exists=${String(existsSync(preloadPath))}`,
  );

  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.webContents.on("preload-error", (_event, path, error) => {
    console.error("[preload] failed", path, error);
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url);
    return { action: "deny" };
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

function registerIpc(): void {
  ipcMain.handle("localDb:getStatus", () => getLocalDbStatus());
  ipcMain.handle("localDb:getSyncMeta", (_event, key: string) =>
    getSyncMeta(key),
  );
  ipcMain.handle(
    "localDb:setSyncMeta",
    (_event, key: string, value: string) => {
      setSyncMeta(key, value);
      return { ok: true as const };
    },
  );

  ipcMain.handle("localDb:upsertBrands", (_event, rows: Brand[]) => {
    upsertBrandsLocal(rows);
    return { ok: true as const };
  });
  ipcMain.handle("localDb:upsertCategories", (_event, rows: Category[]) => {
    upsertCategoriesLocal(rows);
    return { ok: true as const };
  });
  ipcMain.handle("localDb:upsertUnits", (_event, rows: UnitListItem[]) => {
    upsertUnitsLocal(rows);
    return { ok: true as const };
  });
  ipcMain.handle(
    "localDb:upsertVendorGroups",
    (_event, rows: VendorGroup[]) => {
      upsertVendorGroupsLocal(rows);
      return { ok: true as const };
    },
  );
  ipcMain.handle(
    "localDb:upsertWarehouses",
    (_event, rows: WarehouseListItem[]) => {
      upsertWarehousesLocal(rows);
      return { ok: true as const };
    },
  );
  ipcMain.handle("localDb:upsertProducts", (_event, rows: ProductDetail[]) => {
    upsertProductsLocal(rows);
    return { ok: true as const };
  });
  ipcMain.handle(
    "localDb:upsertProductSkus",
    (_event, rows: ProductSkuDetail[]) => {
      upsertProductSkusLocal(rows);
      return { ok: true as const };
    },
  );
  ipcMain.handle("localDb:upsertVendors", (_event, rows: VendorDetail[]) => {
    upsertVendorsLocal(rows);
    return { ok: true as const };
  });
  ipcMain.handle("localDb:upsertVendorSkus", (_event, rows: VendorSku[]) => {
    upsertVendorSkusLocal(rows);
    return { ok: true as const };
  });
  ipcMain.handle(
    "localDb:upsertPurchaseOrders",
    (_event, rows: PurchaseOrderDetail[]) => {
      upsertPurchaseOrdersLocal(rows);
      return { ok: true as const };
    },
  );
  ipcMain.handle(
    "localDb:upsertStockRows",
    (_event, rows: WarehouseStockRow[]) => {
      upsertStockRowsLocal(rows);
      return { ok: true as const };
    },
  );

  ipcMain.handle("localDb:upsertVendor", (_event, detail: VendorDetail) => {
    upsertVendorLocal(detail);
    return { ok: true as const };
  });
  ipcMain.handle("localDb:upsertVendorSku", (_event, row: VendorSku) => {
    upsertVendorSkuLocal(row);
    return { ok: true as const };
  });
  ipcMain.handle("localDb:deactivateVendorSku", (_event, id: string) => {
    deactivateVendorSkuLocal(id);
    return { ok: true as const };
  });
  ipcMain.handle("localDb:upsertProduct", (_event, detail: ProductDetail) => {
    upsertProductLocal(detail);
    return { ok: true as const };
  });
  ipcMain.handle(
    "localDb:upsertProductSku",
    (_event, row: ProductSkuDetail) => {
      upsertProductSkuLocal(row);
      return { ok: true as const };
    },
  );
  ipcMain.handle(
    "localDb:upsertPurchaseOrder",
    (_event, detail: PurchaseOrderDetail) => {
      upsertPurchaseOrderLocal(detail);
      return { ok: true as const };
    },
  );
  ipcMain.handle(
    "localDb:upsertGoodsReceipt",
    (_event, detail: GoodsReceiptDetail) => {
      upsertGoodsReceiptLocal(detail);
      return { ok: true as const };
    },
  );
  ipcMain.handle(
    "localDb:upsertGoodsReceipts",
    (_event, rows: GoodsReceiptDetail[]) => {
      upsertGoodsReceiptsLocal(rows);
      return { ok: true as const };
    },
  );
  ipcMain.handle(
    "localDb:upsertInventoryOut",
    (_event, detail: InventoryOutDetail) => {
      upsertInventoryOutLocal(detail);
      return { ok: true as const };
    },
  );
  ipcMain.handle(
    "localDb:upsertInventoryOuts",
    (_event, rows: InventoryOutDetail[]) => {
      upsertInventoryOutsLocal(rows);
      return { ok: true as const };
    },
  );
  ipcMain.handle(
    "localDb:upsertInventoryMovements",
    (_event, rows: InventoryMovementListItem[]) => {
      upsertInventoryMovementsLocal(rows);
      return { ok: true as const };
    },
  );

  ipcMain.handle(
    "localDb:listProducts",
    (_event, query: ProductListQuery = {}) => listProductsLocal(query),
  );
  ipcMain.handle(
    "localDb:listVendors",
    (_event, query: VendorListQuery = {}) => listVendorsLocal(query),
  );
  ipcMain.handle(
    "localDb:listPurchaseOrders",
    (_event, query: PurchaseOrderListQuery = {}) =>
      listPurchaseOrdersLocal(query),
  );
  ipcMain.handle("localDb:getDashboardSummary", () =>
    getDashboardSummaryLocal(),
  );
  ipcMain.handle(
    "localDb:listBrands",
    (_event, status?: EntityStatus | "all") => listBrandsLocal(status),
  );
  ipcMain.handle(
    "localDb:listCategories",
    (_event, status?: EntityStatus | "all") => listCategoriesLocal(status),
  );
  ipcMain.handle(
    "localDb:listVendorGroups",
    (_event, status?: EntityStatus | "all") => listVendorGroupsLocal(status),
  );
  ipcMain.handle("localDb:listWarehouses", () => listWarehousesLocal());
}

app.disableHardwareAcceleration();

app.whenReady().then(() => {
  try {
    initLocalDb();
  } catch (err: unknown) {
    recordLocalDbInitError(err);
    console.error("[localDb] failed to initialize", err);
  }

  const status = getLocalDbStatus();
  if (status.connected) {
    console.log(
      `[localDb] connected ${status.path} (${status.migrationsApplied} migrations, latest ${status.latestMigration ?? "none"})`,
    );
  } else {
    console.error(`[localDb] not connected: ${status.error}`);
  }

  registerIpc();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  closeLocalDb();
});
