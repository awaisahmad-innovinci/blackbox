import { app, BrowserWindow, ipcMain, shell } from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type {
  Brand,
  Category,
  EntityStatus,
  GoodsReceiptDetail,
  GoodsReceiptListQuery,
  InventoryMovementListItem,
  InventoryOutDetail,
  InventoryOutListQuery,
  InventoryOutReturnDetail,
  InventoryOutReturnListQuery,
  ManagerStockOverviewQuery,
  ProductDetail,
  ProductListQuery,
  ProductSkuDetail,
  PurchaseOrderDetail,
  PurchaseOrderListQuery,
  SaleDetail,
  SaleListQuery,
  SaleReturnDetail,
  SaleReturnListQuery,
  OpenTillRequest,
  ReopenTillRequest,
  TillListItem,
  TillSessionDetail,
  TillStatus,
  WithdrawTillRequest,
  UnitListItem,
  VendorDetail,
  VendorGroup,
  VendorListQuery,
  VendorReturnDetail,
  VendorReturnListQuery,
  VendorSku,
  WarehouseListItem,
  WarehouseStockRow,
} from "@blackbox/shared";
import {
  closeLocalDb,
  getLocalDbStatus,
  initLocalDb,
  recordLocalDbInitError,
  reopenLocalDb,
} from "./db";
import {
  completeSaleReturnStandaloneLocal,
  completeSaleReturnWithSaleLocal,
  listSaleReturnNumbersLocal,
  getSaleReturnCreditForSaleLocal,
  lookupSaleReturnLocal,
  resolveSaleReturnByNumberLocal,
  upsertSaleReturnLocal,
} from "./db/sale-returns-local";
import {
  upsertGoodsReceiptLocal,
  upsertGoodsReceiptsLocal,
} from "./db/goods-receipts-local";
import {
  upsertInventoryOutLocal,
  upsertInventoryOutsLocal,
} from "./db/inventory-out-local";
import { applyInventoryOutBalanceDeltaLocal } from "./db/inventory-out-balance-local";
import {
  upsertInventoryOutReturnLocal,
  upsertInventoryOutReturnsLocal,
} from "./db/inventory-out-returns-local";
import {
  countDraftSalesLocal,
  deleteSaleDraftLocal,
  getDraftSaleReservedQtyLocal,
  getPosAvailableForSaleLocal,
  upsertSaleDraftLocal,
  upsertSaleLocal,
  upsertSalesLocal,
} from "./db/sales-local";
import {
  appendPendingActivityLog,
  appendLocalActivityLog,
  deletePendingActivityLog,
  listLocalActivityLogs,
  listPendingActivityLogs,
  markActivityLogSynced,
} from "./db/activity-log-local";
import {
  applyTillCashFromSaleLocal,
  applyTillCashRefundLocal,
  applyTillReturnCreditOnSaleLocal,
  assertTillCanPayRefundLocal,
  approveTillLocal,
  assertTillCanPostSaleLocal,
  collectCashByAmountLocal,
  collectCashLocal,
  closeTillLocal,
  getCurrentTillLocal,
  getLatestTillSessionLocal,
  listTillsLocal,
  openTillLocal,
  reopenTillLocal,
  upsertTillSessionLocal,
  withdrawTillLocal,
} from "./db/till-local";
import {
  upsertVendorReturnLocal,
  upsertVendorReturnsLocal,
} from "./db/vendor-returns-local";
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
import {
  applyPurchaseAvgCostLocal,
  upsertStockRowsLocal,
} from "./db/stock-local";
import { upsertWarehousesLocal } from "./db/warehouses-local";
import { getSyncMeta, setSyncMeta } from "./db/sync-meta";
import {
  hasSupervisorTotpLocal,
  listSupervisorTotpUsersLocal,
  replaceSupervisorTotpLocal,
} from "./db/supervisor-totp-local";
import { verifySupervisorTotpCode } from "./totp-verify";
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
  getGoodsReceiptLocal,
  getInventoryOutLocal,
  getInventoryOutReturnLocal,
  getSaleLocal,
  getReturnableSaleLinesLocal,
  getSaleReturnLocal,
  resolveSaleByNumberLocal,
  getVendorReturnLocal,
  getProductLocal,
  getProductProfileLocal,
  getPurchaseOrderLocal,
  getReceivingDraftLocal,
  getSkuLocal,
  getSkuProfileLocal,
  getSkuByBarcodeLocal,
  lookupSkuByBarcodeLocal,
  lookupSkuByCodeLocal,
  listSkuCodesLocal,
  getVendorSkuLocal,
  searchSkusLocal,
  listInventoryInOutReportLocal,
  getVendorLocal,
  getVendorProfileLocal,
  listVendorSkusLocal,
} from "./db/entity-get-local";
import {
  deleteSkuBarcodeLocal,
  listSkuBarcodesLocal,
  upsertSkuBarcodeLocal,
} from "./db/sku-barcodes-local";
import {
  getCashierDashboardSummaryLocal,
  getDashboardSummaryLocal,
  getManagerDashboardSummaryLocal,
  listManagerStockOverviewLocal,
  listBrandsLocal,
  getBrandLocal,
  listCategoriesLocal,
  getCategoryLocal,
  listProductsLocal,
  listPurchaseOrdersLocal,
  listGoodsReceiptsLocal,
  listPoNumbersLocal,
  listReceiptNumbersLocal,
  listOutNumbersLocal,
  listOutReturnNumbersLocal,
  listHoldNumbersLocal,
  listSaleNumbersLocal,
  listInventoryOutsLocal,
  listInventoryOutReturnsLocal,
  listSalesLocal,
  listSaleReturnsLocal,
  listVendorGroupsLocal,
  getVendorGroupLocal,
  listUnitsLocal,
  listVendorsLocal,
  getWarehouseLocal,
  listWarehousesLocal,
  listVendorReturnsLocal,
  listPendingVendorReturnsLocal,
  lastPurchaseCostLocal,
  vendorReturnableQuantityLocal,
  inventoryOutReturnableQuantityLocal,
} from "./db/queries-local";
import {
  getOrCreateFingerprint,
  getStableMachineFingerprint,
  persistFingerprint,
  readIdentity,
  writeIdentity,
  type DeviceIdentity,
} from "./db/identity";
import {
  enqueueOutbox,
  listPendingOutbox,
  markOutboxAcked,
  markOutboxPending,
  markOutboxPushing,
  markOutboxRejected,
  pendingOutboxCount,
  getPullCursor,
  resetStalePushing,
} from "./db/outbox-local";
import { applyPullBatch, commitLocalMutation } from "./db/sync-apply";
import { registerPosHandlers } from "./pos/register-pos-handlers";

let appMainWindow: BrowserWindow | null = null;

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

  appMainWindow = mainWindow;
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
    "localDb:upsertInventoryOutReturns",
    (_event, rows: InventoryOutReturnDetail[]) => {
      upsertInventoryOutReturnsLocal(rows);
      return { ok: true as const };
    },
  );
  ipcMain.handle(
    "localDb:upsertInventoryOutReturn",
    (_event, detail: InventoryOutReturnDetail) => {
      upsertInventoryOutReturnLocal(detail);
      return { ok: true as const };
    },
  );
  ipcMain.handle(
    "localDb:upsertSales",
    (_event, rows: SaleDetail[]) => {
      upsertSalesLocal(rows);
      return { ok: true as const };
    },
  );
  ipcMain.handle("localDb:upsertSale", (_event, detail: SaleDetail) => {
    upsertSaleLocal(detail);
    return { ok: true as const };
  });
  ipcMain.handle("localDb:upsertSaleDraft", (_event, detail: SaleDetail) => {
    upsertSaleDraftLocal(detail);
    return { ok: true as const };
  });
  ipcMain.handle("localDb:deleteSaleDraft", (_event, id: string) => ({
    ok: deleteSaleDraftLocal(id),
  }));
  ipcMain.handle("localDb:countDraftSales", () => countDraftSalesLocal());
  ipcMain.handle(
    "localDb:getDraftSaleReservedQty",
    (
      _event,
      warehouseId: string,
      productSkuId: string,
      excludeSaleId?: string | null,
    ) =>
      getDraftSaleReservedQtyLocal(warehouseId, productSkuId, excludeSaleId),
  );
  ipcMain.handle(
    "localDb:getPosAvailableForSale",
    (
      _event,
      warehouseId: string,
      productSkuId: string,
      excludeSaleId?: string | null,
    ) => getPosAvailableForSaleLocal(warehouseId, productSkuId, excludeSaleId),
  );
  ipcMain.handle(
    "localDb:upsertVendorReturn",
    (_event, detail: VendorReturnDetail) => {
      upsertVendorReturnLocal(detail);
      return { ok: true as const };
    },
  );
  ipcMain.handle(
    "localDb:upsertVendorReturns",
    (_event, rows: VendorReturnDetail[]) => {
      upsertVendorReturnsLocal(rows);
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
  ipcMain.handle(
    "localDb:listGoodsReceipts",
    (_event, query: GoodsReceiptListQuery = {}) =>
      listGoodsReceiptsLocal(query),
  );
  ipcMain.handle("localDb:listPoNumbers", () => listPoNumbersLocal());
  ipcMain.handle("localDb:listSkuCodes", () => listSkuCodesLocal());
  ipcMain.handle("localDb:listReceiptNumbers", () =>
    listReceiptNumbersLocal(),
  );
  ipcMain.handle("localDb:listOutNumbers", () => listOutNumbersLocal());
  ipcMain.handle("localDb:listOutReturnNumbers", () =>
    listOutReturnNumbersLocal(),
  );
  ipcMain.handle("localDb:listSaleNumbers", () => listSaleNumbersLocal());
  ipcMain.handle("localDb:listHoldNumbers", () => listHoldNumbersLocal());
  ipcMain.handle(
    "localDb:listInventoryOuts",
    (_event, query: InventoryOutListQuery = {}) =>
      listInventoryOutsLocal(query),
  );
  ipcMain.handle(
    "localDb:listInventoryOutReturns",
    (_event, query: InventoryOutReturnListQuery = {}) =>
      listInventoryOutReturnsLocal(query),
  );
  ipcMain.handle(
    "localDb:listSales",
    (_event, query: SaleListQuery = {}) => listSalesLocal(query),
  );
  ipcMain.handle(
    "localDb:getCurrentTill",
    (_event, userId: string) => getCurrentTillLocal(userId),
  );
  ipcMain.handle(
    "localDb:getLatestTillSession",
    (_event, userId: string) => getLatestTillSessionLocal(userId),
  );
  ipcMain.handle(
    "localDb:listTills",
    (_event, query: { status?: TillStatus; userId?: string } = {}) =>
      listTillsLocal(query),
  );
  ipcMain.handle(
    "localDb:openTill",
    (
      _event,
      input: {
        userId: string;
        userName: string;
        tillUsername: string;
        body: OpenTillRequest;
        requireApproval: boolean;
      },
    ) => openTillLocal(input),
  );
  ipcMain.handle(
    "localDb:approveTill",
    (
      _event,
      input: { id: string; managerId: string; managerName: string },
    ) => approveTillLocal(input),
  );
  ipcMain.handle(
    "localDb:withdrawTill",
    (
      _event,
      input: {
        id: string;
        managerId: string;
        managerName: string;
        body: WithdrawTillRequest;
      },
    ) => withdrawTillLocal(input),
  );
  ipcMain.handle(
    "localDb:collectCashTill",
    (
      _event,
      input: {
        id: string;
        managerId: string;
        managerName: string;
        body: WithdrawTillRequest;
      },
    ) => collectCashLocal(input),
  );
  ipcMain.handle(
    "localDb:collectCashByAmount",
    (
      _event,
      input: {
        userId: string;
        userName: string;
        amount: number;
        supervisorUserId?: string;
        collectedByName?: string;
      },
    ) => collectCashByAmountLocal(input),
  );
  ipcMain.handle(
    "localDb:closeTill",
    (
      _event,
      input: {
        userId: string;
        userName: string;
      },
    ) => closeTillLocal(input),
  );
  ipcMain.handle(
    "localDb:reopenTill",
    (
      _event,
      input: {
        id: string;
        managerId: string;
        managerName: string;
        body: ReopenTillRequest;
      },
    ) => reopenTillLocal(input),
  );
  ipcMain.handle(
    "localDb:upsertTillSession",
    (_event, detail: TillSessionDetail) => {
      upsertTillSessionLocal(detail);
      return { ok: true as const };
    },
  );
  ipcMain.handle(
    "localDb:appendPendingActivityLog",
    (
      _event,
      input: { id: string; payload: import("@blackbox/shared").CreateActivityLogRequest },
    ) => {
      appendPendingActivityLog(input.id, input.payload);
      return { ok: true as const };
    },
  );
  ipcMain.handle(
    "localDb:appendLocalActivityLog",
    (_event, item: import("@blackbox/shared").ActivityLogItem) => {
      appendLocalActivityLog(item);
      return { ok: true as const };
    },
  );
  ipcMain.handle(
    "localDb:listLocalActivityLogs",
    (_event, query: import("@blackbox/shared").ActivityLogListQuery = {}) =>
      listLocalActivityLogs(query),
  );
  ipcMain.handle(
    "localDb:markActivityLogSynced",
    (_event, id: string) => {
      markActivityLogSynced(id);
      return { ok: true as const };
    },
  );
  ipcMain.handle("localDb:listPendingActivityLogs", () =>
    listPendingActivityLogs(),
  );
  ipcMain.handle(
    "localDb:deletePendingActivityLog",
    (_event, id: string) => {
      deletePendingActivityLog(id);
      return { ok: true as const };
    },
  );
  ipcMain.handle(
    "localDb:assertTillCanPostSale",
    (
      _event,
      input: {
        userId: string;
        skipForManager?: boolean;
        cashPaymentTotal: number;
      },
    ) => {
      assertTillCanPostSaleLocal(input);
      return { ok: true as const };
    },
  );
  ipcMain.handle(
    "localDb:applyTillCashFromSale",
    (
      _event,
      input: {
        userId: string;
        skipForManager?: boolean;
        cashPaymentTotal: number;
      },
    ) => {
      applyTillCashFromSaleLocal(input);
      return { ok: true as const };
    },
  );
  ipcMain.handle(
    "localDb:applyTillCashRefund",
    (
      _event,
      input: {
        userId: string;
        skipForManager?: boolean;
        refundAmount: number;
      },
    ) => {
      applyTillCashRefundLocal(input);
      return { ok: true as const };
    },
  );
  ipcMain.handle(
    "localDb:applyTillReturnCreditOnSale",
    (
      _event,
      input: {
        userId: string;
        skipForManager?: boolean;
        cashPaymentTotal: number;
        cashBackFromCredit: number;
      },
    ) => {
      applyTillReturnCreditOnSaleLocal(input);
      return { ok: true as const };
    },
  );
  ipcMain.handle(
    "localDb:assertTillCanPayRefund",
    (
      _event,
      input: {
        userId: string;
        skipForManager?: boolean;
        refundAmount: number;
      },
    ) => {
      assertTillCanPayRefundLocal(input);
      return { ok: true as const };
    },
  );
  ipcMain.handle(
    "localDb:inventoryOutReturnableQuantity",
    (_event, warehouseId: string, productSkuId: string) =>
      inventoryOutReturnableQuantityLocal(warehouseId, productSkuId),
  );
  ipcMain.handle(
    "localDb:applyInventoryOutBalanceDelta",
    (
      _event,
      warehouseId: string,
      productSkuId: string,
      deltaQty: number,
      unitCost: number,
    ) => {
      applyInventoryOutBalanceDeltaLocal(
        warehouseId,
        productSkuId,
        deltaQty,
        unitCost,
      );
      return { ok: true as const };
    },
  );
  ipcMain.handle("localDb:getDashboardSummary", () =>
    getDashboardSummaryLocal(),
  );
  ipcMain.handle(
    "localDb:getCashierDashboardSummary",
    (_event, userId: string) => getCashierDashboardSummaryLocal(userId),
  );
  ipcMain.handle(
    "localDb:getManagerDashboardSummary",
    (_event, userId: string) => getManagerDashboardSummaryLocal(userId),
  );
  ipcMain.handle(
    "localDb:listManagerStockOverview",
    (_event, query: ManagerStockOverviewQuery) =>
      listManagerStockOverviewLocal(query),
  );
  ipcMain.handle(
    "localDb:listBrands",
    (_event, status?: EntityStatus | "all") => listBrandsLocal(status),
  );
  ipcMain.handle("localDb:getBrand", (_event, id: string) => getBrandLocal(id));
  ipcMain.handle(
    "localDb:listCategories",
    (_event, status?: EntityStatus | "all") => listCategoriesLocal(status),
  );
  ipcMain.handle("localDb:getCategory", (_event, id: string) =>
    getCategoryLocal(id),
  );
  ipcMain.handle(
    "localDb:listVendorGroups",
    (_event, status?: EntityStatus | "all") => listVendorGroupsLocal(status),
  );
  ipcMain.handle("localDb:getVendorGroup", (_event, id: string) =>
    getVendorGroupLocal(id),
  );
  ipcMain.handle(
    "localDb:listWarehouses",
    (_event, status?: EntityStatus | "all") => listWarehousesLocal(status),
  );
  ipcMain.handle("localDb:getWarehouse", (_event, id: string) =>
    getWarehouseLocal(id),
  );
  ipcMain.handle("localDb:listUnits", () => listUnitsLocal());
  ipcMain.handle("localDb:getProduct", (_event, id: string) =>
    getProductLocal(id),
  );
  ipcMain.handle("localDb:getProductProfile", (_event, id: string) =>
    getProductProfileLocal(id),
  );
  ipcMain.handle("localDb:getVendor", (_event, id: string) =>
    getVendorLocal(id),
  );
  ipcMain.handle("localDb:getVendorProfile", (_event, id: string) =>
    getVendorProfileLocal(id),
  );
  ipcMain.handle(
    "localDb:listVendorSkus",
    (
      _event,
      vendorId: string,
      q?: string,
      warehouseId?: string,
    ) =>
      listVendorSkusLocal(vendorId, {
        q,
        warehouseId,
        activeOnly: true,
      }),
  );
  ipcMain.handle("localDb:getSku", (_event, id: string) => getSkuLocal(id));
  ipcMain.handle("localDb:getVendorSku", (_event, id: string) =>
    getVendorSkuLocal(id),
  );
  ipcMain.handle(
    "localDb:applyPurchaseAvgCost",
    (
      _event,
      productSkuId: string,
      inventoryDelta: number,
      receivingUnitCost: number,
      unitsPerPurchaseUnit: number,
    ) =>
      applyPurchaseAvgCostLocal(
        productSkuId,
        inventoryDelta,
        receivingUnitCost,
        unitsPerPurchaseUnit,
      ),
  );
  ipcMain.handle("localDb:getSkuProfile", (_event, id: string) =>
    getSkuProfileLocal(id),
  );
  ipcMain.handle(
    "localDb:searchSkus",
    (_event, q?: string, warehouseId?: string) =>
      searchSkusLocal(q, warehouseId),
  );
  ipcMain.handle(
    "localDb:getSkuByBarcode",
    (
      _event,
      barcode: string,
      warehouseId: string,
      balanceSource?: "stock" | "pos",
      excludeDraftSaleId?: string | null,
    ) =>
      getSkuByBarcodeLocal(
        barcode,
        warehouseId,
        balanceSource ?? "stock",
        excludeDraftSaleId,
      ),
  );
  ipcMain.handle("localDb:lookupSkuByBarcode", (_event, barcode: string) =>
    lookupSkuByBarcodeLocal(barcode),
  );
  ipcMain.handle("localDb:lookupSkuByCode", (_event, sku: string) =>
    lookupSkuByCodeLocal(sku),
  );
  ipcMain.handle("localDb:listSkuBarcodes", (_event, skuId: string) =>
    listSkuBarcodesLocal(skuId),
  );
  ipcMain.handle(
    "localDb:upsertSkuBarcode",
    (_event, row: import("@blackbox/shared").SkuBarcode) => {
      upsertSkuBarcodeLocal(row);
    },
  );
  ipcMain.handle(
    "localDb:deleteSkuBarcode",
    (_event, id: string, productSkuId: string) => {
      deleteSkuBarcodeLocal(id, productSkuId);
    },
  );
  ipcMain.handle("localDb:getPurchaseOrder", (_event, id: string) =>
    getPurchaseOrderLocal(id),
  );
  ipcMain.handle("localDb:getReceivingDraft", (_event, poId: string) =>
    getReceivingDraftLocal(poId),
  );
  ipcMain.handle("localDb:getGoodsReceipt", (_event, id: string) =>
    getGoodsReceiptLocal(id),
  );
  ipcMain.handle("localDb:getInventoryOut", (_event, id: string) =>
    getInventoryOutLocal(id),
  );
  ipcMain.handle("localDb:getInventoryOutReturn", (_event, id: string) =>
    getInventoryOutReturnLocal(id),
  );
  ipcMain.handle("localDb:getSale", (_event, id: string) => getSaleLocal(id));
  ipcMain.handle(
    "localDb:resolveSaleByNumber",
    (_event, saleNumber: string) => resolveSaleByNumberLocal(saleNumber),
  );
  ipcMain.handle(
    "localDb:listSaleReturns",
    (_event, query?: SaleReturnListQuery) => listSaleReturnsLocal(query),
  );
  ipcMain.handle("localDb:getSaleReturn", (_event, id: string) =>
    getSaleReturnLocal(id),
  );
  ipcMain.handle(
    "localDb:getReturnableSaleLines",
    (_event, saleId: string) => getReturnableSaleLinesLocal(saleId),
  );
  ipcMain.handle("localDb:upsertSaleReturn", (_event, detail: SaleReturnDetail) => {
    upsertSaleReturnLocal(detail);
    return { ok: true as const };
  });
  ipcMain.handle(
    "localDb:lookupSaleReturn",
    (_event, returnNumber: string) => lookupSaleReturnLocal(returnNumber),
  );
  ipcMain.handle(
    "localDb:resolveSaleReturnByNumber",
    (_event, returnNumber: string) =>
      resolveSaleReturnByNumberLocal(returnNumber),
  );
  ipcMain.handle(
    "localDb:getSaleReturnCreditForSale",
    (_event, saleId: string) => getSaleReturnCreditForSaleLocal(saleId),
  );
  ipcMain.handle(
    "localDb:completeSaleReturnStandalone",
    (
      _event,
      input: { returnId: string; userId: string; userName: string },
    ) => completeSaleReturnStandaloneLocal(input),
  );
  ipcMain.handle(
    "localDb:completeSaleReturnWithSale",
    (
      _event,
      input: {
        returnId: string;
        saleId: string;
        userId: string;
        userName: string;
      },
    ) => completeSaleReturnWithSaleLocal(input),
  );
  ipcMain.handle("localDb:listSaleReturnNumbers", () =>
    listSaleReturnNumbersLocal(),
  );
  ipcMain.handle(
    "localDb:listVendorReturns",
    (_event, query?: VendorReturnListQuery) => listVendorReturnsLocal(query),
  );
  ipcMain.handle("localDb:getVendorReturn", (_event, id: string) =>
    getVendorReturnLocal(id),
  );
  ipcMain.handle(
    "localDb:listPendingVendorReturns",
    (_event, vendorId: string) => listPendingVendorReturnsLocal(vendorId),
  );
  ipcMain.handle(
    "localDb:lastPurchaseCost",
    (_event, vendorId: string, productSkuId: string) =>
      lastPurchaseCostLocal(vendorId, productSkuId),
  );
  ipcMain.handle(
    "localDb:vendorReturnableQuantity",
    (
      _event,
      vendorId: string,
      productSkuId: string,
      warehouseId: string,
    ) =>
      vendorReturnableQuantityLocal(vendorId, productSkuId, warehouseId),
  );
  ipcMain.handle(
    "localDb:inventoryInOutReport",
    (_event, dateFrom: string, dateTo: string) =>
      listInventoryInOutReportLocal(dateFrom, dateTo),
  );

  ipcMain.handle("identity:getFingerprint", () => getOrCreateFingerprint());
  ipcMain.handle("identity:getStableFingerprint", () =>
    getStableMachineFingerprint(),
  );
  ipcMain.handle("identity:persistFingerprint", (_event, fingerprint: string) => {
    persistFingerprint(fingerprint);
    return { ok: true as const };
  });
  ipcMain.handle("identity:get", () => readIdentity());
  ipcMain.handle(
    "identity:bind",
    (_event, identity: DeviceIdentity) => {
      writeIdentity({
        ...identity,
        instanceId: identity.instanceId || crypto.randomUUID(),
      });
      reopenLocalDb();
      resetStalePushing();
      return { ok: true as const, path: getLocalDbStatus().connected ? getLocalDbStatus() : null };
    },
  );
  ipcMain.handle("sync:listOutbox", (_event, limit?: number) =>
    listPendingOutbox(limit ?? 100),
  );
  ipcMain.handle("sync:markPushing", (_event, ids: string[]) => {
    markOutboxPushing(ids);
    return { ok: true as const };
  });
  ipcMain.handle(
    "sync:markAcked",
    (_event, changeId: string, seq?: string) => {
      markOutboxAcked(changeId, seq);
      return { ok: true as const };
    },
  );
  ipcMain.handle(
    "sync:markPending",
    (_event, changeId: string, error: string) => {
      markOutboxPending(changeId, error);
      return { ok: true as const };
    },
  );
  ipcMain.handle(
    "sync:markRejected",
    (_event, changeId: string, error: string) => {
      markOutboxRejected(changeId, error);
      return { ok: true as const };
    },
  );
  ipcMain.handle("sync:pullCursor", (_event, stream: string) =>
    getPullCursor(stream),
  );
  ipcMain.handle(
    "sync:applyPull",
    (
      _event,
      payload: {
        changes: import("@blackbox/shared").SyncChangeDto[];
        nextCursor: string;
        stream: string;
      },
    ) => {
      applyPullBatch(payload.changes, payload.nextCursor, payload.stream);
      return { ok: true as const };
    },
  );
  ipcMain.handle("sync:pendingCount", () => pendingOutboxCount());
  ipcMain.handle(
    "sync:enqueue",
    (
      _event,
      input: Parameters<typeof enqueueOutbox>[0],
    ) => ({ changeId: enqueueOutbox(input) }),
  );
  ipcMain.handle(
    "sync:commit",
    (
      _event,
      input: Parameters<typeof commitLocalMutation>[0],
    ) => ({ changeId: commitLocalMutation(input) }),
  );

  ipcMain.handle("totp:verifySupervisorCode", (_event, code: string) =>
    verifySupervisorTotpCode(code),
  );
  ipcMain.handle(
    "localDb:replaceSupervisorTotp",
    (
      _event,
      entries: Array<{ userId: string; secretBase32: string; displayName: string }>,
    ) => {
      replaceSupervisorTotpLocal(entries);
      return { ok: true as const };
    },
  );
  ipcMain.handle("localDb:listSupervisorTotpUsers", () =>
    listSupervisorTotpUsersLocal(),
  );
  ipcMain.handle("localDb:hasSupervisorTotp", () => hasSupervisorTotpLocal());

  registerPosHandlers(ipcMain, () => appMainWindow);
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
