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
  ENTITY_STATUSES as entityStatusesList,
  UNIT_TYPES as unitTypesList,
  INVENTORY_MOVEMENT_TYPES as inventoryMovementTypesList,
  PURCHASE_ORDER_STATUSES as purchaseOrderStatusesList,
  GOODS_RECEIPT_STATUSES as goodsReceiptStatusesList,
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
  JwtPayload,
} from "./auth";
export type {
  DeviceStatus,
  Device,
  DeviceUser,
  RegisterDeviceRequest,
} from "./devices";
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
  SkuSearchResult,
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
  InventoryMovementListItem,
  InventoryMovementListQuery,
  PaginatedInventoryMovements,
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
export { MASTER_DATA_IMPORT_FILES } from "./inventory";
export const VENDOR_CONTACT_TYPES = vendorContactTypesList;
export const PAYMENT_TERMS = paymentTermsList;
export const PAYMENT_TERMS_LABELS = paymentTermsLabels;
export const PRODUCT_TYPES = productTypesList;
export const PRODUCT_TYPE_LABELS = productTypeLabels;
export const DEMO_STORE_TENANT_ID = demoStoreTenantId;
