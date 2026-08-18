import { app, BrowserWindow, ipcMain, shell } from "electron";
import { join } from "node:path";
import type {
  GoodsReceiptDetail,
  ProductDetail,
  ProductSkuDetail,
  PurchaseOrderDetail,
  VendorDetail,
  VendorSku,
} from "@blackbox/shared";
import { closeLocalDb, initLocalDb } from "./db";
import { upsertGoodsReceiptLocal } from "./db/goods-receipts-local";
import {
  upsertProductLocal,
  upsertProductSkuLocal,
} from "./db/products-local";
import { upsertPurchaseOrderLocal } from "./db/purchase-orders-local";
import {
  deactivateVendorSkuLocal,
  upsertVendorLocal,
  upsertVendorSkuLocal,
} from "./db/vendors-local";

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
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
  ipcMain.handle("localDb:upsertVendor", (_event, detail: VendorDetail) => {
    upsertVendorLocal(detail);
    return { ok: true };
  });
  ipcMain.handle("localDb:upsertVendorSku", (_event, row: VendorSku) => {
    upsertVendorSkuLocal(row);
    return { ok: true };
  });
  ipcMain.handle("localDb:deactivateVendorSku", (_event, id: string) => {
    deactivateVendorSkuLocal(id);
    return { ok: true };
  });
  ipcMain.handle("localDb:upsertProduct", (_event, detail: ProductDetail) => {
    upsertProductLocal(detail);
    return { ok: true };
  });
  ipcMain.handle(
    "localDb:upsertProductSku",
    (_event, row: ProductSkuDetail) => {
      upsertProductSkuLocal(row);
      return { ok: true };
    },
  );
  ipcMain.handle(
    "localDb:upsertPurchaseOrder",
    (_event, detail: PurchaseOrderDetail) => {
      upsertPurchaseOrderLocal(detail);
      return { ok: true };
    },
  );
  ipcMain.handle(
    "localDb:upsertGoodsReceipt",
    (_event, detail: GoodsReceiptDetail) => {
      upsertGoodsReceiptLocal(detail);
      return { ok: true };
    },
  );
}

app.whenReady().then(() => {
  initLocalDb();
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
