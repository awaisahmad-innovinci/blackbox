/** Inventory / warehouse domain enums and DTOs. */

export const ENTITY_STATUSES = ["active", "inactive"] as const;
export type EntityStatus = (typeof ENTITY_STATUSES)[number];

export const UNIT_TYPES = ["count", "weight", "volume", "length", "other"] as const;
export type UnitType = (typeof UNIT_TYPES)[number];

export const INVENTORY_MOVEMENT_TYPES = [
  "OPENING_BALANCE",
  "PURCHASE_RECEIPT",
  "SALE",
  "STOCK_ADJUSTMENT",
  "TRANSFER_IN",
  "TRANSFER_OUT",
  "RETURN",
  "INVENTORY_OUT",
] as const;
export type InventoryMovementType = (typeof INVENTORY_MOVEMENT_TYPES)[number];

export const INVENTORY_OUT_STATUSES = ["POSTED", "CANCELLED"] as const;
export type InventoryOutStatus = (typeof INVENTORY_OUT_STATUSES)[number];

export const PURCHASE_ORDER_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "PARTIALLY_RECEIVED",
  "RECEIVED",
  "CANCELLED",
] as const;
export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[number];

export const GOODS_RECEIPT_STATUSES = [
  "DRAFT",
  "POSTED",
  "CANCELLED",
] as const;
export type GoodsReceiptStatus = (typeof GOODS_RECEIPT_STATUSES)[number];

export const VENDOR_CONTACT_TYPES = [
  "PRIMARY",
  "OTHER",
  "MANAGER",
  "SALESPERSON",
] as const;
export type VendorContactType = (typeof VENDOR_CONTACT_TYPES)[number];

export const PAYMENT_TERMS = [
  "CASH",
  "7_DAYS",
  "15_DAYS",
  "30_DAYS",
  "45_DAYS",
  "CUSTOM",
] as const;
export type PaymentTerms = (typeof PAYMENT_TERMS)[number];

export const PAYMENT_TERMS_LABELS: Record<PaymentTerms, string> = {
  CASH: "Cash",
  "7_DAYS": "7 Days",
  "15_DAYS": "15 Days",
  "30_DAYS": "30 Days",
  "45_DAYS": "45 Days",
  CUSTOM: "Custom",
};

export const PRODUCT_TYPES = [
  "STOCK_ITEM",
  "CONSUMABLE",
  "RESALABLE",
] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

export const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  STOCK_ITEM: "Stock Item",
  CONSUMABLE: "Consumable",
  RESALABLE: "Resalable Product",
};

/** Fixed Demo Store tenant id used for Phase A single-user desktop (no auth). */
export const DEMO_STORE_TENANT_ID = "a0000000-0000-4000-8000-000000000001";

export interface DashboardSummary {
  totalProducts: number;
  totalSkus: number;
  totalStockLines: number;
  lowStockItems: number;
  pendingPurchaseOrders: number;
  recentReceipts: number;
}

export interface VendorContactInput {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface RequiredVendorContactInput {
  name: string;
  phone: string;
  email?: string | null;
}

export interface VendorContact {
  id: string;
  contactType: VendorContactType;
  name: string | null;
  phone: string | null;
  email: string | null;
}

export interface VendorGroup {
  id: string;
  name: string;
  description: string;
  status: EntityStatus;
}

export interface TaxonomyListQuery {
  /** Omit or leave unset → active only (dropdowns). Use `"all"` for management lists. */
  status?: EntityStatus | "all";
  q?: string;
}

export interface CreateVendorGroupRequest {
  name: string;
  description?: string;
  status?: EntityStatus;
}

export type UpdateVendorGroupRequest = CreateVendorGroupRequest;

export interface VendorListItem {
  id: string;
  name: string;
  vendorCode: string;
  groupId: string | null;
  groupName: string | null;
  status: EntityStatus;
  city: string | null;
  primaryContactName: string | null;
  primaryContactPhone: string | null;
  suppliedSkuCount: number;
}

export interface VendorDetail {
  id: string;
  name: string;
  vendorCode: string;
  groupId: string | null;
  groupName: string | null;
  status: EntityStatus;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postalCode: string | null;
  salesTarget: number | null;
  creditLimit: number | null;
  paymentTerms: PaymentTerms | null;
  taxNumber: string | null;
  notes: string;
  contacts: VendorContact[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateVendorRequest {
  name: string;
  vendorCode: string;
  groupId?: string | null;
  status?: EntityStatus;
  primaryContact: RequiredVendorContactInput;
  otherContact?: VendorContactInput;
  managerContact: RequiredVendorContactInput;
  salespersonContact?: VendorContactInput;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  postalCode?: string | null;
  salesTarget?: number | null;
  creditLimit?: number | null;
  paymentTerms?: PaymentTerms | null;
  taxNumber?: string | null;
  notes?: string;
}

export type UpdateVendorRequest = CreateVendorRequest;

export interface VendorListQuery {
  search?: string;
  status?: EntityStatus;
  groupId?: string;
  page?: number;
  pageSize?: number;
}

export interface PaginatedVendors {
  items: VendorListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface VendorSku {
  id: string;
  vendorId: string;
  productSkuId: string;
  vendorSkuCode: string | null;
  purchasePrice: number;
  purchaseUnitId: string | null;
  purchaseUnitName: string | null;
  unitsPerPurchaseUnit: number;
  minimumOrderQuantity: number;
  leadTimeDays: number;
  isPreferred: boolean;
  status: EntityStatus;
  notes: string;
  productName: string;
  variantName: string;
  sku: string;
  barcode: string | null;
  /** Present when list is requested with warehouseId. */
  quantityAvailable?: number;
}

export interface CreateVendorSkuRequest {
  vendorId: string;
  productSkuId: string;
  vendorSkuCode?: string | null;
  purchasePrice: number;
  purchaseUnitId?: string | null;
  unitsPerPurchaseUnit?: number;
  minimumOrderQuantity?: number;
  leadTimeDays?: number;
  isPreferred?: boolean;
  notes?: string;
}

export interface UpdateVendorSkuRequest {
  vendorSkuCode?: string | null;
  purchasePrice?: number;
  purchaseUnitId?: string | null;
  unitsPerPurchaseUnit?: number;
  minimumOrderQuantity?: number;
  leadTimeDays?: number;
  isPreferred?: boolean;
  notes?: string;
  status?: EntityStatus;
}

export interface SkuSearchResult {
  id: string;
  productId: string;
  productName: string;
  variantName: string;
  sku: string;
  barcode: string | null;
  /** Present when search includes warehouseId. */
  quantityAvailable?: number;
  /** Present when search includes warehouseId. */
  costPrice?: number;
}

export interface SkuDetail {
  id: string;
  productId: string;
  productName: string;
  productCode: string;
  variantName: string;
  sku: string;
  barcode: string | null;
  sizeValue: string | null;
  sizeUnit: string | null;
  baseUnitId: string | null;
  baseUnitName: string | null;
  purchaseUnitId: string | null;
  purchaseUnitName: string | null;
  unitsPerPurchaseUnit: number;
  costPrice: number;
  sellingPrice: number;
  reorderLevel: number;
  minimumStockLevel: number;
  maximumStockLevel: number | null;
  trackInventory: boolean;
  status: EntityStatus;
}

export interface SkuSupplier {
  vendorSkuId: string;
  vendorId: string;
  vendorName: string;
  vendorCode: string;
  purchasePrice: number;
  minimumOrderQuantity: number;
  leadTimeDays: number;
  isPreferred: boolean;
  purchaseUnitName: string | null;
}

export interface UnitListItem {
  id: string;
  name: string;
  abbreviation: string;
  type: string;
  status: EntityStatus;
}

export interface Brand {
  id: string;
  name: string;
  description: string;
  status: EntityStatus;
}

export interface CreateBrandRequest {
  name: string;
  description?: string;
  status?: EntityStatus;
}

export type UpdateBrandRequest = CreateBrandRequest;

export interface Category {
  id: string;
  name: string;
  description: string;
  status: EntityStatus;
}

export interface CreateCategoryRequest {
  name: string;
  description?: string;
  status?: EntityStatus;
}

export type UpdateCategoryRequest = CreateCategoryRequest;

export interface ProductListItem {
  id: string;
  name: string;
  productCode: string;
  brandId: string | null;
  brandName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  productType: ProductType;
  status: EntityStatus;
  skuCount: number;
  totalAvailable: number;
  supplierCount: number;
}

export interface ProductDetail {
  id: string;
  name: string;
  productCode: string;
  brandId: string | null;
  brandName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  productType: ProductType;
  description: string;
  imagePath: string | null;
  status: EntityStatus;
  totalOnHand: number;
  totalReserved: number;
  totalAvailable: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProductRequest {
  name: string;
  brandId: string;
  categoryId: string;
  productType?: ProductType;
  description?: string;
  status?: EntityStatus;
}

export type UpdateProductRequest = CreateProductRequest;

export interface ProductListQuery {
  search?: string;
  brandId?: string;
  categoryId?: string;
  status?: EntityStatus;
  page?: number;
  pageSize?: number;
}

export interface PaginatedProducts {
  items: ProductListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ProductSkuDetail {
  id: string;
  productId: string;
  variantName: string;
  sku: string;
  barcode: string | null;
  sizeValue: string | null;
  sizeUnit: string | null;
  baseUnitId: string | null;
  baseUnitName: string | null;
  purchaseUnitId: string | null;
  purchaseUnitName: string | null;
  unitsPerPurchaseUnit: number;
  costPrice: number;
  sellingPrice: number;
  reorderLevel: number;
  minimumStockLevel: number;
  maximumStockLevel: number | null;
  trackInventory: boolean;
  status: EntityStatus;
}

export interface CreateProductSkuRequest {
  variantName: string;
  sku: string;
  barcode?: string | null;
  sizeValue?: string | null;
  sizeUnit?: string | null;
  baseUnitId?: string | null;
  purchaseUnitId?: string | null;
  unitsPerPurchaseUnit?: number;
  costPrice?: number;
  sellingPrice?: number;
  reorderLevel?: number;
  minimumStockLevel?: number;
  maximumStockLevel?: number | null;
  trackInventory?: boolean;
  status?: EntityStatus;
}

export type UpdateProductSkuRequest = CreateProductSkuRequest;

export interface ProductSupplierRow {
  vendorSkuId: string;
  productSkuId: string;
  sku: string;
  variantName: string;
  vendorId: string;
  vendorName: string;
  vendorSkuCode: string | null;
  purchasePrice: number;
  minimumOrderQuantity: number;
  leadTimeDays: number;
  isPreferred: boolean;
}

export interface WarehouseStockRow {
  warehouseId: string;
  warehouseName: string;
  productSkuId: string;
  sku: string;
  variantName: string;
  quantityOnHand: number;
  quantityReserved: number;
  quantityAvailable: number;
}

export interface StockMovementRow {
  id: string;
  productSkuId: string;
  sku: string;
  variantName: string;
  warehouseId: string;
  warehouseName: string;
  movementType: InventoryMovementType;
  quantity: number;
  reason: string;
  createdAt: string;
}

export interface WarehouseListItem {
  id: string;
  name: string;
  code: string;
  location: string | null;
  status: EntityStatus;
}

export interface PurchaseOrderItemRow {
  id: string;
  productSkuId: string;
  vendorSkuId: string;
  productName: string;
  variantName: string;
  sku: string;
  vendorSkuCode: string | null;
  purchaseUnitId: string | null;
  purchaseUnitName: string | null;
  unitsPerPurchaseUnit: number;
  quantity: number;
  unitCost: number;
  discount: number;
  tax: number;
  lineTotal: number;
  minimumOrderQuantity: number;
}

export interface PurchaseOrderListItem {
  id: string;
  poNumber: string;
  vendorId: string;
  vendorName: string;
  warehouseId: string;
  warehouseName: string;
  status: PurchaseOrderStatus;
  orderDate: string;
  expectedDate: string | null;
  total: number;
  itemCount: number;
}

export interface PurchaseOrderDetail {
  id: string;
  poNumber: string;
  vendorId: string;
  vendorName: string;
  warehouseId: string;
  warehouseName: string;
  status: PurchaseOrderStatus;
  orderDate: string;
  expectedDate: string | null;
  subtotal: number;
  discount: number;
  tax: number;
  otherCharges: number;
  total: number;
  notes: string;
  items: PurchaseOrderItemRow[];
  createdAt: string;
  updatedAt: string;
}

export interface CreatePurchaseOrderItemRequest {
  productSkuId: string;
  vendorSkuId: string;
  quantity: number;
  unitCost: number;
  discount?: number;
  tax?: number;
}

export interface CreatePurchaseOrderRequest {
  vendorId: string;
  warehouseId: string;
  orderDate?: string;
  expectedDate?: string | null;
  notes?: string;
  discount?: number;
  tax?: number;
  otherCharges?: number;
  items: CreatePurchaseOrderItemRequest[];
  submit?: boolean;
}

export type UpdatePurchaseOrderRequest = CreatePurchaseOrderRequest;

export interface UpdatePurchaseOrderItemPriceRequest {
  unitCost: number;
  sellingPrice: number;
}

export interface PurchaseOrderListQuery {
  search?: string;
  vendorId?: string;
  warehouseId?: string;
  status?: PurchaseOrderStatus;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

export interface PaginatedPurchaseOrders {
  items: PurchaseOrderListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ReceivingLineDraft {
  purchaseOrderItemId: string;
  productSkuId: string;
  vendorSkuId: string | null;
  productName: string;
  variantName: string;
  sku: string;
  vendorSkuCode: string | null;
  purchaseUnitId: string | null;
  purchaseUnitName: string | null;
  unitsPerPurchaseUnit: number;
  orderedQuantity: number;
  poUnitCost: number;
  currentVendorPurchasePrice: number | null;
  currentSellingPrice: number;
}

export interface ReceivingDraft {
  purchaseOrderId: string;
  poNumber: string;
  vendorId: string;
  vendorName: string;
  warehouseId: string;
  warehouseName: string;
  status: PurchaseOrderStatus;
  items: ReceivingLineDraft[];
}

export interface CreateGoodsReceiptItemRequest {
  purchaseOrderItemId: string;
  receivedQuantity: number;
  receivingUnitCost: number;
}

export interface CreateGoodsReceiptRequest {
  receiptDate?: string;
  voucherNumber?: string | null;
  notes?: string;
  discount?: number;
  tax?: number;
  otherCharges?: number;
  items: CreateGoodsReceiptItemRequest[];
}

export interface GoodsReceiptItemRow {
  id: string;
  purchaseOrderItemId: string | null;
  productSkuId: string;
  vendorSkuId: string | null;
  productName: string;
  variantName: string;
  sku: string;
  vendorSkuCode: string | null;
  purchaseUnitId: string | null;
  purchaseUnitName: string | null;
  unitsPerPurchaseUnit: number;
  orderedQuantity: number;
  receivedQuantity: number;
  poUnitCost: number;
  receivingUnitCost: number;
  lineTotal: number;
}

export interface GoodsReceiptDetail {
  id: string;
  receiptNumber: string;
  purchaseOrderId: string;
  poNumber: string;
  vendorId: string | null;
  vendorName: string | null;
  warehouseId: string;
  warehouseName: string;
  status: GoodsReceiptStatus;
  receivedAt: string | null;
  voucherNumber: string | null;
  subtotal: number;
  discount: number;
  tax: number;
  otherCharges: number;
  total: number;
  notes: string;
  items: GoodsReceiptItemRow[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateInventoryOutItemRequest {
  productSkuId: string;
  quantity: number;
}

export interface CreateInventoryOutRequest {
  warehouseId: string;
  outDate?: string;
  reference?: string | null;
  notes?: string;
  items: CreateInventoryOutItemRequest[];
}

export interface InventoryOutItemRow {
  id: string;
  productSkuId: string;
  productName: string;
  variantName: string;
  sku: string;
  barcode: string | null;
  quantity: number;
  unitCost: number;
  lineTotal: number;
}

export interface InventoryOutDetail {
  id: string;
  outNumber: string;
  warehouseId: string;
  warehouseName: string;
  outDate: string;
  reference: string | null;
  notes: string;
  status: InventoryOutStatus;
  subtotal: number;
  total: number;
  items: InventoryOutItemRow[];
  createdAt: string;
  updatedAt: string;
}
