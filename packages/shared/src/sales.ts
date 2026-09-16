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
