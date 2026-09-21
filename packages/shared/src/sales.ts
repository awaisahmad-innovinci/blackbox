export const SALE_STATUSES = ["DRAFT", "POSTED", "VOID"] as const;
export type SaleStatus = (typeof SALE_STATUSES)[number];

export const SALE_PAYMENT_METHODS = ["CASH", "CARD", "CREDIT"] as const;
export type SalePaymentMethod = (typeof SALE_PAYMENT_METHODS)[number];

export type SellUnit = "pc" | "box";

export const DEFAULT_SALE_CUSTOMER_NAME = "CASH SALES CUSTOMER";

export interface SalePaymentRow {
  id: string;
  method: SalePaymentMethod;
  amount: number;
  reference: string;
}

export interface SaleLineRow {
  id: string;
  productSkuId: string;
  productName: string;
  variantName: string;
  sku: string;
  barcode: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  sellUnit: SellUnit;
  discountPercent: number;
  focQuantity: number;
  /** Draft bill only: one manager-approved qty correction already used on this line. */
  quantityCorrected?: boolean;
}

export interface SaleDetail {
  id: string;
  saleNumber: string;
  warehouseId: string;
  warehouseName: string;
  status: SaleStatus;
  subtotal: number;
  gstRate: number;
  gstAmount: number;
  salesTaxRate: number;
  salesTaxAmount: number;
  total: number;
  customerName: string;
  /** Cash received from customer; null for card/credit sales. */
  cashTendered: number | null;
  notes: string;
  deviceId: string | null;
  postedBy: string | null;
  postedByName: string | null;
  postedAt: string | null;
  items: SaleLineRow[];
  payments: SalePaymentRow[];
  createdAt: string;
  updatedAt: string;
}

export interface SaleListItem {
  id: string;
  saleNumber: string;
  warehouseId: string;
  warehouseName: string;
  status: SaleStatus;
  total: number;
  itemCount: number;
  postedAt: string | null;
}

export interface SaleListQuery {
  search?: string;
  warehouseId?: string;
  status?: SaleStatus;
  dateFrom?: string;
  dateTo?: string;
  /** When true, only sales with any line focQuantity > 0. When false, exclude those. */
  hasFoc?: boolean;
  page?: number;
  pageSize?: number;
}

export interface PaginatedSales {
  items: SaleListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateSaleLineRequest {
  productSkuId: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  sellUnit?: SellUnit;
  barcode?: string | null;
  discountPercent?: number;
  focQuantity?: number;
}

export interface CreateSalePaymentRequest {
  method: SalePaymentMethod;
  amount: number;
  reference?: string;
}

export interface CreateSaleRequest {
  warehouseId: string;
  saleNumber?: string;
  gstRate?: number;
  salesTaxRate?: number;
  customerName?: string;
  cashTendered?: number;
  notes?: string;
  /** Required when any line has focQuantity > 0 (manager/owner who approved FOC). */
  supervisorUserId?: string;
  items: CreateSaleLineRequest[];
  payments: CreateSalePaymentRequest[];
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export function saleBillTotals(
  subtotal: number,
  gstRate: number,
  salesTaxRate: number,
): { gstAmount: number; salesTaxAmount: number; total: number } {
  const base = round4(subtotal);
  const gstAmount = round4(base * (gstRate / 100));
  const salesTaxAmount = round4(base * (salesTaxRate / 100));
  return {
    gstAmount,
    salesTaxAmount,
    total: round4(base + gstAmount + salesTaxAmount),
  };
}

export function saleLineTotal(quantity: number, unitPrice: number): number {
  return round4(quantity * unitPrice);
}

/** Max cash tender allowed for a bill (5000, 10000, 15000, …). */
export function maxCashTender(billTotal: number): number {
  if (billTotal <= 0) return 5000;
  return Math.ceil(billTotal / 5000) * 5000;
}

export interface ReturnableSaleLine {
  saleLineId: string;
  productSkuId: string;
  productName: string;
  variantName: string;
  sku: string;
  barcode: string | null;
  soldQuantity: number;
  returnedQuantity: number;
  returnableQuantity: number;
  unitPrice: number;
  discountPercent: number;
  sellUnit: SellUnit;
}

export interface SaleReturnLineRow {
  id: string;
  saleLineId: string;
  productSkuId: string;
  productName: string;
  variantName: string;
  sku: string;
  barcode: string | null;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  lineTotal: number;
  sellUnit: SellUnit;
}

export interface SaleReturnDetail {
  id: string;
  returnNumber: string;
  saleId: string;
  saleNumber: string;
  warehouseId: string;
  warehouseName: string;
  returnDate: string;
  status: "POSTED";
  subtotal: number;
  gstRate: number;
  gstAmount: number;
  salesTaxRate: number;
  salesTaxAmount: number;
  refundTotal: number;
  refundMethod: SalePaymentMethod;
  notes: string;
  processedBy: string | null;
  processedByName: string | null;
  sale: SaleDetail;
  items: SaleReturnLineRow[];
  createdAt: string;
  updatedAt: string;
}

export interface SaleReturnListItem {
  id: string;
  returnNumber: string;
  saleId: string;
  saleNumber: string;
  warehouseId: string;
  warehouseName: string;
  returnDate: string;
  refundTotal: number;
  refundMethod: SalePaymentMethod;
  lineCount: number;
  processedByName: string | null;
  createdAt: string;
}

export interface SaleReturnListQuery {
  search?: string;
  warehouseId?: string;
  saleId?: string;
  dateFrom?: string;
  dateTo?: string;
  hasFoc?: boolean;
  page?: number;
  pageSize?: number;
}

export interface PaginatedSaleReturns {
  items: SaleReturnListItem[];
  total: number;
  page: number;
  pageSize: number;
  refundTotalSum: number;
}

export interface CreateSaleReturnLineRequest {
  saleLineId: string;
  productSkuId: string;
  quantity: number;
}

export interface CreateSaleReturnRequest {
  saleId: string;
  returnNumber?: string;
  returnDate?: string;
  notes?: string;
  items: CreateSaleReturnLineRequest[];
}

/** Manager dashboard — today's till collections and refunds for the logged-in supervisor. */
export interface ManagerDashboardSummary {
  /** Local calendar date (YYYY-MM-DD). */
  date: string;
  tillCashCollectedAmount: number;
  customerReturnCount: number;
  refundTotalAmount: number;
  netAfterRefundsAmount: number;
}
