import {
  PERMISSIONS as permissionsList,
  PERMISSION_DESCRIPTIONS as permissionDescriptions,
  isPermission as checkIsPermission,
} from "./permissions";
import type { Permission } from "./permissions";

import {
  DEFAULT_ROLES as defaultRolesList,
  DEFAULT_ROLE_NAMES as defaultRoleNames,
  isDefaultRole as checkIsDefaultRole,
} from "./roles";
import type { DefaultRole } from "./roles";

import { DEFAULT_ROLE_PERMISSIONS as defaultRolePermissions } from "./seeds";

import {
  DEVICE_STATUSES as deviceStatuses,
  OFFLINE_AUTHORIZATION_DAYS_DEFAULT as offlineAuthorizationDaysDefault,
  ACCESS_TOKEN_TTL_SECONDS as accessTokenTtlSeconds,
  REFRESH_TOKEN_TTL_SECONDS as refreshTokenTtlSeconds,
} from "./devices";

import {
  BUSINESS_TYPES as businessTypesList,
  BUSINESS_TYPE_LABELS as businessTypeLabels,
  isBusinessType as checkIsBusinessType,
  COUNTRIES as countriesList,
  COUNTRY_CODES as countryCodesList,
  isCountryCode as checkIsCountryCode,
  CURRENCIES as currenciesList,
  CURRENCY_CODES as currencyCodesList,
  isCurrencyCode as checkIsCurrencyCode,
  DEFAULT_CURRENCY_BY_COUNTRY as defaultCurrencyByCountry,
} from "./onboarding";

import {
  PERSON_NAME_PATTERN as personNamePattern,
  USERNAME_PATTERN as usernamePattern,
  EMAIL_PATTERN as emailPattern,
  PHONE_11_DIGIT_PATTERN as phone11DigitPattern,
  PERSON_NAME_MESSAGE as personNameMessage,
  USERNAME_MESSAGE as usernameMessage,
  EMAIL_MESSAGE as emailMessage,
  PHONE_11_DIGIT_MESSAGE as phone11DigitMessage,
  USERNAME_MIN_LENGTH as usernameMinLength,
  personNameError as checkPersonNameError,
  usernameError as checkUsernameError,
  emailError as checkEmailError,
  phone11DigitError as checkPhone11DigitError,
  livePersonNameError as checkLivePersonNameError,
  liveUsernameError as checkLiveUsernameError,
  liveEmailError as checkLiveEmailError,
  livePhone11DigitError as checkLivePhone11DigitError,
  livePasswordError as checkLivePasswordError,
  normalizeStoredText as normalizeStoredTextFn,
  normalizeOptionalStoredText as normalizeOptionalStoredTextFn,
} from "./validation";

import {
  ENTITY_STATUSES as entityStatusesList,
  UNIT_TYPES as unitTypesList,
  INVENTORY_MOVEMENT_TYPES as inventoryMovementTypesList,
  PURCHASE_ORDER_STATUSES as purchaseOrderStatusesList,
  GOODS_RECEIPT_STATUSES as goodsReceiptStatusesList,
  VENDOR_RETURN_STATUSES as vendorReturnStatusesList,
  VENDOR_RETURN_REASONS as vendorReturnReasonsList,
  VENDOR_RETURN_REASON_LABELS as vendorReturnReasonLabels,
  VENDOR_RETURN_SETTLEMENTS as vendorReturnSettlementsList,
  VENDOR_RETURN_SETTLEMENT_LABELS as vendorReturnSettlementLabels,
  VENDOR_CONTACT_TYPES as vendorContactTypesList,
  PAYMENT_TERMS as paymentTermsList,
  PAYMENT_TERMS_LABELS as paymentTermsLabels,
  PRODUCT_TYPES as productTypesList,
  PRODUCT_TYPE_LABELS as productTypeLabels,
  DEMO_STORE_TENANT_ID as demoStoreTenantId,
} from "./inventory";

export type { Permission, DefaultRole };
export type {
  AuthClient,
  AuthUser,
  AuthTokens,
  AuthResponse,
  SignupTenantRequest,
  LoginRequest,
  RefreshRequest,
  LogoutRequest,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  MessageResponse,
  JwtPayload,
} from "./auth";
export { SESSION_ALREADY_ACTIVE_ON_OTHER_DEVICE_MESSAGE } from "./auth";
export type {
  DeviceStatus,
  Device,
  DeviceUser,
  RegisterDeviceRequest,
} from "./devices";
export {
  SYNC_STREAMS,
  SYNC_OPERATIONS,
  SYNC_PUSH_BATCH_SIZE,
  SYNC_PULL_BATCH_SIZE,
  SYNC_MAX_BODY_BYTES,
  SYNC_MAX_PAYLOAD_BYTES,
  streamForEntity,
} from "./sync";
export type {
  SyncStream,
  SyncOperation,
  SyncEntityType,
  MasterDataEntityType,
  InventoryEntityType,
  PurchasingEntityType,
  SyncChangeInput,
  SyncPushRequest,
  SyncPushItemStatus,
  SyncPushItemResult,
  SyncPushResponse,
  SyncChangeDto,
  SyncPullResponse,
  SyncStreamStatus,
  SyncStatusResponse,
  SyncConflictAckRequest,
} from "./sync";
export type {
  BusinessType,
  CountryCode,
  CurrencyCode,
  OnboardingBusinessRequest,
  OnboardingLocationRequest,
} from "./onboarding";
export type {
  EntityStatus,
  UnitType,
  InventoryMovementType,
  PurchaseOrderStatus,
  GoodsReceiptStatus,
  DashboardSummary,
  VendorContactType,
  PaymentTerms,
  VendorContactInput,
  RequiredVendorContactInput,
  VendorContact,
  VendorGroup,
  TaxonomyListQuery,
  CreateVendorGroupRequest,
  UpdateVendorGroupRequest,
  VendorListItem,
  VendorDetail,
  CreateVendorRequest,
  UpdateVendorRequest,
  VendorListQuery,
  PaginatedVendors,
  VendorSku,
  CreateVendorSkuRequest,
  UpdateVendorSkuRequest,
  SellUnit,
  SkuSearchResult,
  SkuBarcode,
  CreateSkuBarcodeRequest,
  SkuBarcodeLookupResult,
  SkuDetail,
  SkuSupplier,
  UnitListItem,
  ProductType,
  Brand,
  CreateBrandRequest,
  UpdateBrandRequest,
  Category,
  CreateCategoryRequest,
  UpdateCategoryRequest,
  ProductListItem,
  ProductDetail,
  CreateProductRequest,
  UpdateProductRequest,
  ProductListQuery,
  PaginatedProducts,
  ProductSkuDetail,
  CreateProductSkuRequest,
  UpdateProductSkuRequest,
  ProductSupplierRow,
  WarehouseStockRow,
  StockMovementRow,
  WarehouseListItem,
  CreateWarehouseRequest,
  UpdateWarehouseRequest,
  PurchaseOrderItemRow,
  PurchaseOrderListItem,
  PurchaseOrderDetail,
  CreatePurchaseOrderItemRequest,
  CreatePurchaseOrderRequest,
  UpdatePurchaseOrderRequest,
  UpdatePurchaseOrderItemPriceRequest,
  PurchaseOrderListQuery,
  PaginatedPurchaseOrders,
  ReceivingLineDraft,
  ReceivingDraft,
  CreateGoodsReceiptItemRequest,
  CreateGoodsReceiptRequest,
  GoodsReceiptItemRow,
  GoodsReceiptDetail,
  GoodsReceiptListItem,
  GoodsReceiptListQuery,
  PaginatedGoodsReceipts,
  CreateInventoryOutItemRequest,
  CreateInventoryOutRequest,
  InventoryOutItemRow,
  InventoryOutDetail,
  InventoryOutStatus,
  InventoryOutListItem,
  InventoryOutListQuery,
  PaginatedInventoryOuts,
  VendorReturnStatus,
  VendorReturnReason,
  VendorReturnSettlement,
  CreateVendorReturnItemRequest,
  CreateVendorReturnRequest,
  VendorReturnItemRow,
  VendorReturnDetail,
  VendorReturnListItem,
  VendorReturnListQuery,
  PaginatedVendorReturns,
  PendingVendorReturnLine,
  GoodsReceiptReturnAdjustment,
  InventoryMovementListItem,
  InventoryMovementListQuery,
  PaginatedInventoryMovements,
  InventoryInOutReportQuery,
  InventoryInOutReportBucket,
  InventoryInOutReportDay,
  InventoryInOutReport,
  InventoryInOutDirection,
  InventoryInOutReportClientFilters,
  MasterDataImportFile,
  MasterDataImportError,
  MasterDataImportFileResult,
  MasterDataImportResult,
  MasterDataImportFailure,
} from "./inventory";

/** Own bindings so Vite/Rollup CJS interop sees named exports. */
export const PERMISSIONS = permissionsList;
export const PERMISSION_DESCRIPTIONS = permissionDescriptions;
export const isPermission = checkIsPermission;

export const DEFAULT_ROLES = defaultRolesList;
export const DEFAULT_ROLE_NAMES = defaultRoleNames;
export const isDefaultRole = checkIsDefaultRole;

export const DEFAULT_ROLE_PERMISSIONS = defaultRolePermissions;

export const DEVICE_STATUSES = deviceStatuses;
export const OFFLINE_AUTHORIZATION_DAYS_DEFAULT =
  offlineAuthorizationDaysDefault;
export const ACCESS_TOKEN_TTL_SECONDS = accessTokenTtlSeconds;
export const REFRESH_TOKEN_TTL_SECONDS = refreshTokenTtlSeconds;

export const BUSINESS_TYPES = businessTypesList;
export const BUSINESS_TYPE_LABELS = businessTypeLabels;
export const isBusinessType = checkIsBusinessType;
export const COUNTRIES = countriesList;
export const COUNTRY_CODES = countryCodesList;
export const isCountryCode = checkIsCountryCode;
export const CURRENCIES = currenciesList;
export const CURRENCY_CODES = currencyCodesList;
export const isCurrencyCode = checkIsCurrencyCode;
export const DEFAULT_CURRENCY_BY_COUNTRY = defaultCurrencyByCountry;

export const ENTITY_STATUSES = entityStatusesList;
export const UNIT_TYPES = unitTypesList;
export const INVENTORY_MOVEMENT_TYPES = inventoryMovementTypesList;
export const PURCHASE_ORDER_STATUSES = purchaseOrderStatusesList;
export const GOODS_RECEIPT_STATUSES = goodsReceiptStatusesList;
export const VENDOR_RETURN_STATUSES = vendorReturnStatusesList;
export const VENDOR_RETURN_REASONS = vendorReturnReasonsList;
export const VENDOR_RETURN_REASON_LABELS = vendorReturnReasonLabels;
export const VENDOR_RETURN_SETTLEMENTS = vendorReturnSettlementsList;
export const VENDOR_RETURN_SETTLEMENT_LABELS = vendorReturnSettlementLabels;
export {
  businessInitials,
  productNameSlug,
  nextSequentialCode,
  vendorCodePrefix,
  poNumberPrefix,
  receiptNumberPrefix,
  outNumberPrefix,
  nextVendorCode,
  nextPoNumber,
  nextReceiptNumber,
  nextOutNumber,
  nextSkuCodeForProduct,
} from "./document-numbers";
export {
  MASTER_DATA_IMPORT_FILES,
  nextSkuCode,
  roundMoney4,
  pieceCostFromPurchase,
  sellingPriceFromCostMargin,
  weightedAvgUnitCost,
  clampDiscountPercent,
  lineTotalAfterDiscount,
  netUnitAfterDiscounts,
  goodsReceiptCostCharges,
  goodsReceiptCostCredits,
  goodsReceiptGrandTotal,
  landedUnitByQuantity,
  lineTotalForScan,
} from "./inventory";
export {
  DEFAULT_INVENTORY_IN_OUT_REPORT_FILTERS,
  matchesInventoryInOutMovement,
  applyInventoryInOutReportFilters,
} from "./inventory-in-out-report-filters";
export {
  buildInventoryInOutReportCsv,
  escapeCsvField,
  inventoryInOutReportCsvFilename,
} from "./inventory-in-out-report-csv";
export {
  DEFAULT_INVENTORY_IN_OUT_PERIOD,
  lastDayOfMonth,
  isSingleDayRange,
  resolveInventoryInOutReportRange,
  aggregateInOutByMonth,
  aggregateInOutByYear,
  dailySummaryRows,
} from "./inventory-in-out-report-period";
export type {
  InventoryInOutPeriodMode,
  InventoryInOutPeriodInput,
  InventoryInOutPeriodSummaryRow,
} from "./inventory-in-out-report-period";
export const VENDOR_CONTACT_TYPES = vendorContactTypesList;
export const PAYMENT_TERMS = paymentTermsList;
export const PAYMENT_TERMS_LABELS = paymentTermsLabels;
export const PRODUCT_TYPES = productTypesList;
export const PRODUCT_TYPE_LABELS = productTypeLabels;
export const DEMO_STORE_TENANT_ID = demoStoreTenantId;

export const PERSON_NAME_PATTERN = personNamePattern;
export const USERNAME_PATTERN = usernamePattern;
export const EMAIL_PATTERN = emailPattern;
export const PHONE_11_DIGIT_PATTERN = phone11DigitPattern;
export const PERSON_NAME_MESSAGE = personNameMessage;
export const USERNAME_MESSAGE = usernameMessage;
export const EMAIL_MESSAGE = emailMessage;
export const PHONE_11_DIGIT_MESSAGE = phone11DigitMessage;
export const USERNAME_MIN_LENGTH = usernameMinLength;
export const personNameError = checkPersonNameError;
export const usernameError = checkUsernameError;
export const emailError = checkEmailError;
export const phone11DigitError = checkPhone11DigitError;
export const livePersonNameError = checkLivePersonNameError;
export const liveUsernameError = checkLiveUsernameError;
export const liveEmailError = checkLiveEmailError;
export const livePhone11DigitError = checkLivePhone11DigitError;
export const livePasswordError = checkLivePasswordError;
export const normalizeStoredText = normalizeStoredTextFn;
export const normalizeOptionalStoredText = normalizeOptionalStoredTextFn;

export { buildReceivedAtIso, formatStoredDateTime } from "./datetime";
