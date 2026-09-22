/// <reference types="vite/client" />

import type {
  Brand,
  CashierDashboardSummary,
  Category,
  DashboardSummary,
  EntityStatus,
  ManagerDashboardSummary,
  ManagerStockOverviewQuery,
  PaginatedManagerStockOverview,
  GoodsReceiptDetail,
  GoodsReceiptListQuery,
  InventoryInOutReport,
  InventoryMovementListItem,
  InventoryOutDetail,
  InventoryOutListQuery,
  InventoryOutReturnDetail,
  InventoryOutReturnListQuery,
  PaginatedInventoryOuts,
  PaginatedInventoryOutReturns,
  PaginatedProducts,
  PaginatedPurchaseOrders,
  PaginatedGoodsReceipts,
  PaginatedSales,
  PaginatedSaleReturns,
  PaginatedVendors,
  ProductDetail,
  ProductListQuery,
  ProductSkuDetail,
  ProductSupplierRow,
  PurchaseOrderDetail,
  PurchaseOrderListQuery,
  SaleDetail,
  SaleListQuery,
  SaleReturnDetail,
  SaleReturnListQuery,
  ReturnableSaleLine,
  OpenTillRequest,
  ReopenTillRequest,
  TillListItem,
  TillSessionDetail,
  TillStatus,
  WithdrawTillRequest,
  ReceivingDraft,
  SkuBarcode,
  SkuBarcodeLookupResult,
  SkuDetail,
  SkuSearchResult,
  SkuSupplier,
  StockMovementRow,
  UnitListItem,
  VendorDetail,
  VendorGroup,
  VendorListQuery,
  VendorReturnDetail,
  VendorReturnListQuery,
  PaginatedVendorReturns,
  PendingVendorReturnLine,
  PosPrinterInfo,
  PosPrinterSettings,
  VendorSku,
  WarehouseListItem,
  WarehouseStockRow,
} from "@blackbox/shared";

export type LocalDbStatus =
  | {
      connected: true;
      path: string;
      migrationsApplied: number;
      latestMigration: string | null;
    }
  | {
      connected: false;
      path: string | null;
      error: string;
    };

export {};

declare global {
  interface ImportMetaEnv {
    readonly VITE_API_URL: string;
  }

  interface Window {
    blackbox?: {
      platform: NodeJS.Platform;
      localDb?: {
        getStatus: () => Promise<LocalDbStatus>;
        getSyncMeta: (key: string) => Promise<string | null>;
        setSyncMeta: (key: string, value: string) => Promise<{ ok: true }>;
        upsertBrands: (rows: Brand[]) => Promise<{ ok: true }>;
        upsertCategories: (rows: Category[]) => Promise<{ ok: true }>;
        upsertUnits: (rows: UnitListItem[]) => Promise<{ ok: true }>;
        upsertVendorGroups: (rows: VendorGroup[]) => Promise<{ ok: true }>;
        upsertWarehouses: (rows: WarehouseListItem[]) => Promise<{ ok: true }>;
        upsertProducts: (rows: ProductDetail[]) => Promise<{ ok: true }>;
        upsertProductSkus: (rows: ProductSkuDetail[]) => Promise<{ ok: true }>;
        upsertVendors: (rows: VendorDetail[]) => Promise<{ ok: true }>;
        upsertVendorSkus: (rows: VendorSku[]) => Promise<{ ok: true }>;
        upsertPurchaseOrders: (
          rows: PurchaseOrderDetail[],
        ) => Promise<{ ok: true }>;
        upsertStockRows: (rows: WarehouseStockRow[]) => Promise<{ ok: true }>;
        upsertVendor: (detail: VendorDetail) => Promise<{ ok: true }>;
        upsertVendorSku: (row: VendorSku) => Promise<{ ok: true }>;
        deactivateVendorSku: (id: string) => Promise<{ ok: true }>;
        upsertProduct: (detail: ProductDetail) => Promise<{ ok: true }>;
        upsertProductSku: (row: ProductSkuDetail) => Promise<{ ok: true }>;
        upsertPurchaseOrder: (
          detail: PurchaseOrderDetail,
        ) => Promise<{ ok: true }>;
        upsertGoodsReceipt: (
          detail: GoodsReceiptDetail,
        ) => Promise<{ ok: true }>;
        upsertGoodsReceipts: (
          rows: GoodsReceiptDetail[],
        ) => Promise<{ ok: true }>;
        upsertInventoryOut: (
          detail: InventoryOutDetail,
        ) => Promise<{ ok: true }>;
        upsertInventoryOuts: (
          rows: InventoryOutDetail[],
        ) => Promise<{ ok: true }>;
        upsertInventoryOutReturn: (
          detail: InventoryOutReturnDetail,
        ) => Promise<{ ok: true }>;
        upsertInventoryOutReturns: (
          rows: InventoryOutReturnDetail[],
        ) => Promise<{ ok: true }>;
        upsertSale: (detail: SaleDetail) => Promise<{ ok: true }>;
        upsertSaleDraft: (detail: SaleDetail) => Promise<{ ok: true }>;
        deleteSaleDraft: (id: string) => Promise<{ ok: boolean }>;
        countDraftSales: () => Promise<number>;
        getDraftSaleReservedQty: (
          warehouseId: string,
          productSkuId: string,
          excludeSaleId?: string | null,
        ) => Promise<number>;
        getPosAvailableForSale: (
          warehouseId: string,
          productSkuId: string,
          excludeSaleId?: string | null,
        ) => Promise<number>;
        upsertSales: (rows: SaleDetail[]) => Promise<{ ok: true }>;
        upsertVendorReturn: (
          detail: VendorReturnDetail,
        ) => Promise<{ ok: true }>;
        upsertVendorReturns: (
          rows: VendorReturnDetail[],
        ) => Promise<{ ok: true }>;
        upsertInventoryMovements: (
          rows: InventoryMovementListItem[],
        ) => Promise<{ ok: true }>;
        listProducts: (
          query?: ProductListQuery,
        ) => Promise<PaginatedProducts>;
        listVendors: (query?: VendorListQuery) => Promise<PaginatedVendors>;
        listPurchaseOrders: (
          query?: PurchaseOrderListQuery,
        ) => Promise<PaginatedPurchaseOrders>;
        listGoodsReceipts: (
          query?: GoodsReceiptListQuery,
        ) => Promise<PaginatedGoodsReceipts>;
        listPoNumbers: () => Promise<string[]>;
        listSkuCodes: () => Promise<string[]>;
        listReceiptNumbers: () => Promise<string[]>;
        listOutNumbers: () => Promise<string[]>;
        listOutReturnNumbers: () => Promise<string[]>;
        listSaleNumbers: () => Promise<string[]>;
        listSaleReturnNumbers: () => Promise<string[]>;
        listHoldNumbers: () => Promise<string[]>;
        listInventoryOuts: (
          query?: InventoryOutListQuery,
        ) => Promise<PaginatedInventoryOuts>;
        listInventoryOutReturns: (
          query?: InventoryOutReturnListQuery,
        ) => Promise<PaginatedInventoryOutReturns>;
        listSales: (query?: SaleListQuery) => Promise<PaginatedSales>;
        listSaleReturns: (
          query?: SaleReturnListQuery,
        ) => Promise<PaginatedSaleReturns>;
        getSaleReturn: (id: string) => Promise<SaleReturnDetail | null>;
        getReturnableSaleLines: (saleId: string) => Promise<ReturnableSaleLine[]>;
        upsertSaleReturn: (detail: SaleReturnDetail) => Promise<{ ok: true }>;
        lookupSaleReturn: (
          returnNumber: string,
        ) => Promise<import("@blackbox/shared").SaleReturnLookupSummary>;
        resolveSaleByNumber: (
          saleNumber: string,
        ) => Promise<{ id: string; saleNumber: string } | null>;
        resolveSaleReturnByNumber: (
          returnNumber: string,
        ) => Promise<{ id: string; returnNumber: string } | null>;
        getSaleReturnCreditForSale: (
          saleId: string,
        ) => Promise<{ returnNumber: string; amount: number } | null>;
        completeSaleReturnStandalone: (input: {
          returnId: string;
          userId: string;
          userName: string;
        }) => Promise<SaleReturnDetail>;
        completeSaleReturnWithSale: (input: {
          returnId: string;
          saleId: string;
          userId: string;
          userName: string;
        }) => Promise<SaleReturnDetail>;
        getCurrentTill: (userId: string) => Promise<TillSessionDetail | null>;
        getLatestTillSession: (userId: string) => Promise<TillSessionDetail | null>;
        listTills: (query?: {
          status?: TillStatus;
          userId?: string;
        }) => Promise<TillListItem[]>;
        openTill: (input: {
          userId: string;
          userName: string;
          tillUsername: string;
          body: OpenTillRequest;
          requireApproval: boolean;
        }) => Promise<TillSessionDetail>;
        approveTill: (input: {
          id: string;
          managerId: string;
          managerName: string;
        }) => Promise<TillSessionDetail>;
        withdrawTill: (input: {
          id: string;
          managerId: string;
          managerName: string;
          body: WithdrawTillRequest;
        }) => Promise<TillSessionDetail>;
        collectCashTill: (input: {
          id: string;
          managerId: string;
          managerName: string;
          body: WithdrawTillRequest;
        }) => Promise<TillSessionDetail>;
        collectCashByAmount: (input: {
          userId: string;
          userName: string;
          amount: number;
          supervisorUserId?: string;
          collectedByName?: string;
        }) => Promise<TillSessionDetail>;
        closeTill: (input: {
          userId: string;
          userName: string;
        }) => Promise<TillSessionDetail>;
        reopenTill: (input: {
          id: string;
          managerId: string;
          managerName: string;
          body: ReopenTillRequest;
        }) => Promise<TillSessionDetail>;
        upsertTillSession: (detail: TillSessionDetail) => Promise<{ ok: true }>;
        assertTillCanPostSale: (input: {
          userId: string;
          skipForManager?: boolean;
          cashPaymentTotal: number;
        }) => Promise<{ ok: true }>;
        applyTillCashFromSale: (input: {
          userId: string;
          skipForManager?: boolean;
          cashPaymentTotal: number;
        }) => Promise<{ ok: true }>;
        applyTillCashRefund: (input: {
          userId: string;
          skipForManager?: boolean;
          refundAmount: number;
        }) => Promise<{ ok: true }>;
        applyTillReturnCreditOnSale: (input: {
          userId: string;
          skipForManager?: boolean;
          cashPaymentTotal: number;
          cashBackFromCredit: number;
        }) => Promise<{ ok: true }>;
        assertTillCanPayRefund: (input: {
          userId: string;
          skipForManager?: boolean;
          refundAmount: number;
        }) => Promise<{ ok: true }>;
        appendPendingActivityLog: (input: {
          id: string;
          payload: import("@blackbox/shared").CreateActivityLogRequest;
        }) => Promise<{ ok: true }>;
        appendLocalActivityLog: (
          item: import("@blackbox/shared").ActivityLogItem,
        ) => Promise<{ ok: true }>;
        listLocalActivityLogs: (
          query?: import("@blackbox/shared").ActivityLogListQuery,
        ) => Promise<import("@blackbox/shared").PaginatedActivityLogs>;
        markActivityLogSynced: (id: string) => Promise<{ ok: true }>;
        listPendingActivityLogs: () => Promise<
          Array<{
            id: string;
            payload: import("@blackbox/shared").CreateActivityLogRequest;
            createdAt: string;
          }>
        >;
        deletePendingActivityLog: (id: string) => Promise<{ ok: true }>;
        inventoryOutReturnableQuantity: (
          warehouseId: string,
          productSkuId: string,
        ) => Promise<{ quantityAvailable: number }>;
        applyInventoryOutBalanceDelta: (
          warehouseId: string,
          productSkuId: string,
          deltaQty: number,
          unitCost: number,
        ) => Promise<{ ok: true }>;
        getDashboardSummary: () => Promise<DashboardSummary>;
        getCashierDashboardSummary: (
          userId: string,
        ) => Promise<CashierDashboardSummary>;
        getManagerDashboardSummary: (
          userId: string,
        ) => Promise<ManagerDashboardSummary>;
        listManagerStockOverview: (
          query?: ManagerStockOverviewQuery,
        ) => Promise<PaginatedManagerStockOverview>;
        listBrands: (status?: EntityStatus | "all") => Promise<Brand[]>;
        getBrand: (id: string) => Promise<Brand | null>;
        listCategories: (status?: EntityStatus | "all") => Promise<Category[]>;
        getCategory: (id: string) => Promise<Category | null>;
        listVendorGroups: (
          status?: EntityStatus | "all",
        ) => Promise<VendorGroup[]>;
        getVendorGroup: (id: string) => Promise<VendorGroup | null>;
        listWarehouses: (
          status?: EntityStatus | "all",
        ) => Promise<WarehouseListItem[]>;
        getWarehouse: (id: string) => Promise<WarehouseListItem | null>;
        listUnits: () => Promise<UnitListItem[]>;
        getProduct: (id: string) => Promise<ProductDetail | null>;
        getProductProfile: (id: string) => Promise<{
          product: ProductDetail;
          skus: ProductSkuDetail[];
          suppliers: ProductSupplierRow[];
          inventory: WarehouseStockRow[];
          movements: StockMovementRow[];
        } | null>;
        getVendor: (id: string) => Promise<VendorDetail | null>;
        getVendorProfile: (id: string) => Promise<{
          vendor: VendorDetail;
          skus: VendorSku[];
        } | null>;
        listVendorSkus: (
          vendorId: string,
          q?: string,
          warehouseId?: string,
        ) => Promise<VendorSku[]>;
        getSku: (id: string) => Promise<SkuDetail | null>;
        getVendorSku: (id: string) => Promise<VendorSku | null>;
        applyPurchaseAvgCost: (
          productSkuId: string,
          inventoryDelta: number,
          receivingUnitCost: number,
          unitsPerPurchaseUnit: number,
        ) => Promise<{ sku: SkuDetail; avgCost: number } | null>;
        getSkuProfile: (id: string) => Promise<{
          sku: SkuDetail;
          suppliers: SkuSupplier[];
          inventory: WarehouseStockRow[];
        } | null>;
        searchSkus: (
          q?: string,
          warehouseId?: string,
        ) => Promise<SkuSearchResult[]>;
        getSkuByBarcode: (
          barcode: string,
          warehouseId: string,
          balanceSource?: "stock" | "pos",
          excludeDraftSaleId?: string | null,
        ) => Promise<SkuSearchResult | null>;
        lookupSkuByBarcode: (
          barcode: string,
        ) => Promise<SkuBarcodeLookupResult | null>;
        lookupSkuByCode: (
          sku: string,
        ) => Promise<SkuBarcodeLookupResult | null>;
        listSkuBarcodes: (skuId: string) => Promise<SkuBarcode[]>;
        upsertSkuBarcode: (row: SkuBarcode) => Promise<void>;
        deleteSkuBarcode: (id: string, productSkuId: string) => Promise<void>;
        getPurchaseOrder: (id: string) => Promise<PurchaseOrderDetail | null>;
        getReceivingDraft: (poId: string) => Promise<ReceivingDraft | null>;
        getGoodsReceipt: (id: string) => Promise<GoodsReceiptDetail | null>;
        getInventoryOut: (id: string) => Promise<InventoryOutDetail | null>;
        getInventoryOutReturn: (
          id: string,
        ) => Promise<InventoryOutReturnDetail | null>;
        getSale: (id: string) => Promise<SaleDetail | null>;
        listVendorReturns: (
          query?: VendorReturnListQuery,
        ) => Promise<PaginatedVendorReturns>;
        getVendorReturn: (id: string) => Promise<VendorReturnDetail | null>;
        listPendingVendorReturns: (
          vendorId: string,
        ) => Promise<PendingVendorReturnLine[]>;
        lastPurchaseCost: (
          vendorId: string,
          productSkuId: string,
        ) => Promise<number>;
        vendorReturnableQuantity: (
          vendorId: string,
          productSkuId: string,
          warehouseId: string,
        ) => Promise<number>;
        inventoryInOutReport: (
          dateFrom: string,
          dateTo: string,
        ) => Promise<InventoryInOutReport>;
      };
      identity?: {
        getFingerprint: () => Promise<string>;
        getStableFingerprint: () => Promise<string | null>;
        persistFingerprint: (fingerprint: string) => Promise<{ ok: true }>;
        get: () => Promise<{
          tenantId: string;
          deviceId: string;
          instanceId: string;
        } | null>;
        bind: (identity: {
          tenantId: string;
          deviceId: string;
          instanceId: string;
        }) => Promise<{ ok: true }>;
      };
      pos?: {
        getPrinterSettings: () => Promise<PosPrinterSettings>;
        savePrinterSettings: (
          settings: PosPrinterSettings,
        ) => Promise<{ ok: true }>;
        listPrinters: () => Promise<PosPrinterInfo[]>;
        openCashDrawer: () => Promise<{ ok: true }>;
        testDrawer: () => Promise<{ ok: true }>;
      };
      sync?: {
        listOutbox: (limit?: number) => Promise<unknown>;
        markPushing: (ids: string[]) => Promise<{ ok: true }>;
        markAcked: (
          changeId: string,
          seq?: string,
        ) => Promise<{ ok: true }>;
        markPending: (
          changeId: string,
          error: string,
        ) => Promise<{ ok: true }>;
        markRejected: (
          changeId: string,
          error: string,
        ) => Promise<{ ok: true }>;
        pullCursor: (stream: string) => Promise<string>;
        applyPull: (payload: {
          changes: import("@blackbox/shared").SyncChangeDto[];
          nextCursor: string;
          stream: string;
        }) => Promise<{ ok: true }>;
        pendingCount: () => Promise<number>;
        enqueue: (input: unknown) => Promise<{ changeId: string }>;
        commit: (input: unknown) => Promise<{ changeId: string }>;
      };
      totp?: {
        verifySupervisorCode: (
          code: string,
        ) => Promise<import("@blackbox/shared").TotpVerifySupervisorCodeResult>;
        replaceSupervisorCache: (
          entries: Array<{
            userId: string;
            secretBase32: string;
            displayName: string;
          }>,
        ) => Promise<{ ok: true }>;
        listSupervisorUsers: () => Promise<string[]>;
        hasSupervisorCache: () => Promise<boolean>;
      };
    };
  }
}
