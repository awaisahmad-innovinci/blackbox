import type {
  Brand,
  Category,
  GoodsReceiptDetail,
  InventoryOutDetail,
  InventoryOutReturnDetail,
  ProductDetail,
  PurchaseOrderDetail,
  SaleDetail,
  TillSessionDetail,
  SyncChangeDto,
  SyncEntityType,
  SyncOperation,
  SyncStream,
  UnitListItem,
  VendorDetail,
  VendorGroup,
  VendorReturnDetail,
} from "@blackbox/shared";
import { getLocalDb } from "./index";
import { readIdentity } from "./identity";
import { DEMO_STORE_TENANT_ID } from "@blackbox/shared";
import {
  enqueueOutbox,
  recordApplied,
  setPullCursor,
  wasApplied,
} from "./outbox-local";
import {
  upsertBrandLocal,
  upsertCategoryLocal,
  upsertUnitLocal,
  upsertVendorGroupLocal,
} from "./taxonomy-local";
import { upsertWarehouseLocal } from "./warehouses-local";
import { upsertInventoryMovementLocal } from "./movements-local";
import { applyStockDeltaLocal } from "./stock-local";
import { upsertProductLocal, upsertProductSkuLocal } from "./products-local";
import { upsertVendorLocal, upsertVendorSkuLocal } from "./vendors-local";
import {
  deleteSkuBarcodeLocal,
  upsertSkuBarcodeLocal,
} from "./sku-barcodes-local";
import { upsertPurchaseOrderLocal } from "./purchase-orders-local";
import { upsertGoodsReceiptLocal } from "./goods-receipts-local";
import { upsertInventoryOutLocal } from "./inventory-out-local";
import { applyInventoryOutBalanceDeltaLocal } from "./inventory-out-balance-local";
import { upsertInventoryOutReturnLocal } from "./inventory-out-returns-local";
import { upsertSaleLocal } from "./sales-local";
import { upsertTillSessionLocal } from "./till-local";
import { upsertVendorReturnLocal } from "./vendor-returns-local";
import { getPurchaseOrderLocal } from "./entity-get-local";
import {
  getLocalEntityVersion,
  setLocalEntityVersion,
} from "./entity-versions-local";

export function applyPullBatch(
  changes: SyncChangeDto[],
  nextCursor: string,
  stream: string,
): void {
  const identity = readIdentity();
  const db = getLocalDb();
  const run = db.transaction(() => {
    for (const change of changes) {
      if (wasApplied(change.changeId)) continue;
      if (identity && change.originDeviceId === identity.deviceId) {
        if (change.operation !== "EVENT" && change.entityVersion > 0) {
          setLocalEntityVersion(
            change.entityType,
            change.entityId,
            change.entityVersion,
          );
        }
        recordApplied(change.changeId, Number(change.seq), change.stream);
        continue;
      }
      applyChange(change);
      if (change.operation !== "EVENT" && change.entityVersion > 0) {
        setLocalEntityVersion(
          change.entityType,
          change.entityId,
          change.entityVersion,
        );
      }
      recordApplied(change.changeId, Number(change.seq), change.stream);
    }
    setPullCursor(stream, nextCursor);
  });
  run();
}

export function commitLocalMutation(input: {
  stream: SyncStream;
  entityType: SyncEntityType;
  entityId: string;
  operation: SyncOperation;
  payload: Record<string, unknown>;
  baseEntityVersion?: number;
}): string {
  const db = getLocalDb();
  const baseEntityVersion =
    input.baseEntityVersion !== undefined
      ? input.baseEntityVersion
      : getLocalEntityVersion(input.entityType, input.entityId);
  let changeId = "";
  const run = db.transaction(() => {
    applyChange({
      seq: "0",
      changeId: "local",
      originDeviceId: "",
      stream: input.stream,
      entityType: input.entityType,
      entityId: input.entityId,
      operation: input.operation,
      entityVersion: 0,
      payload: input.payload,
      createdAt: new Date().toISOString(),
    });
    changeId = enqueueOutbox({ ...input, baseEntityVersion });
  });
  run();
  return changeId;
}

export function applyChange(change: SyncChangeDto): void {
  const p = change.payload;
  const now = change.createdAt;
  if (change.entityType === "brand") {
    upsertBrandLocal(namedTaxonomy(p, change.entityId) as Brand);
    return;
  }
  if (change.entityType === "category") {
    upsertCategoryLocal(namedTaxonomy(p, change.entityId) as Category);
    return;
  }
  if (change.entityType === "unit") {
    upsertUnitLocal({
      id: change.entityId,
      name: str(p.name),
      abbreviation: str(p.abbreviation),
      type: str(p.type, "COUNT") as UnitListItem["type"],
      status: statusOf(p, change.operation),
    });
    return;
  }
  if (change.entityType === "vendor_group") {
    upsertVendorGroupLocal(namedTaxonomy(p, change.entityId) as VendorGroup);
    return;
  }
  if (change.entityType === "warehouse") {
    upsertWarehouseLocal({
      id: change.entityId,
      name: str(p.name),
      code: str(p.code),
      location: (p.location as string | null) ?? null,
      status: statusOf(p, change.operation),
    });
    return;
  }
  if (change.entityType === "product") {
    upsertProductLocal({
      id: change.entityId,
      name: str(p.name),
      productCode: str(p.productCode),
      brandId: (p.brandId as string | null) ?? null,
      brandName: (p.brandName as string | null) ?? null,
      categoryId: (p.categoryId as string | null) ?? null,
      categoryName: (p.categoryName as string | null) ?? null,
      productType: (p.productType as ProductDetail["productType"]) ?? "STOCK_ITEM",
      description: str(p.description),
      imagePath: (p.imagePath as string | null) ?? null,
      status: statusOf(p, change.operation),
      totalOnHand: Number(p.totalOnHand ?? 0),
      totalReserved: Number(p.totalReserved ?? 0),
      totalAvailable: Number(p.totalAvailable ?? 0),
      createdAt: str(p.createdAt, now),
      updatedAt: str(p.updatedAt, now),
    });
    return;
  }
  if (change.entityType === "product_sku") {
    upsertProductSkuLocal({
      id: change.entityId,
      productId: str(p.productId),
      sku: str(p.sku),
      barcode: (p.barcode as string | null) ?? null,
      variantName: str(p.variantName),
      sizeValue: (p.sizeValue as string | null) ?? null,
      sizeUnit: (p.sizeUnit as string | null) ?? null,
      baseUnitId: (p.baseUnitId as string | null) ?? null,
      baseUnitName: (p.baseUnitName as string | null) ?? null,
      purchaseUnitId: (p.purchaseUnitId as string | null) ?? null,
      purchaseUnitName: (p.purchaseUnitName as string | null) ?? null,
      unitsPerPurchaseUnit: Number(p.unitsPerPurchaseUnit ?? 1),
      costPrice: Number(p.costPrice ?? 0),
      sellingPrice: Number(p.sellingPrice ?? 0),
      sellingPricePerPurchaseUnit:
        p.sellingPricePerPurchaseUnit == null
          ? null
          : Number(p.sellingPricePerPurchaseUnit),
      reorderLevel: Number(p.reorderLevel ?? 0),
      minimumStockLevel: Number(p.minimumStockLevel ?? 0),
      maximumStockLevel:
        p.maximumStockLevel == null ? null : Number(p.maximumStockLevel),
      trackInventory: Boolean(p.trackInventory ?? true),
      status: statusOf(p, change.operation),
    });
    return;
  }
  if (change.entityType === "vendor") {
    upsertVendorLocal({
      id: change.entityId,
      name: str(p.name),
      vendorCode: str(p.vendorCode),
      groupId: (p.groupId as string | null) ?? null,
      groupName: (p.groupName as string | null) ?? null,
      status: statusOf(p, change.operation),
      address: (p.address as string | null) ?? null,
      city: (p.city as string | null) ?? null,
      state: (p.state as string | null) ?? null,
      country: (p.country as string | null) ?? null,
      postalCode: (p.postalCode as string | null) ?? null,
      salesTarget: numOrNull(p.salesTarget),
      creditLimit: numOrNull(p.creditLimit),
      paymentTerms: (p.paymentTerms as VendorDetail["paymentTerms"]) ?? null,
      taxNumber: (p.taxNumber as string | null) ?? null,
      notes: str(p.notes),
      contacts: Array.isArray(p.contacts) ? (p.contacts as VendorDetail["contacts"]) : [],
      createdAt: str(p.createdAt, now),
      updatedAt: str(p.updatedAt, now),
    });
    return;
  }
  if (change.entityType === "vendor_sku") {
    upsertVendorSkuLocal({
      id: change.entityId,
      vendorId: str(p.vendorId),
      productSkuId: str(p.productSkuId),
      vendorSkuCode: (p.vendorSkuCode as string | null) ?? null,
      purchaseUnitId: (p.purchaseUnitId as string | null) ?? null,
      purchaseUnitName: (p.purchaseUnitName as string | null) ?? null,
      unitsPerPurchaseUnit: Number(p.unitsPerPurchaseUnit ?? 1),
      purchasePrice: Number(p.purchasePrice ?? 0),
      minimumOrderQuantity: Number(p.minimumOrderQuantity ?? 1),
      leadTimeDays: Number(p.leadTimeDays ?? 0),
      isPreferred: Boolean(p.isPreferred),
      status: statusOf(p, change.operation),
      notes: str(p.notes),
      productName: str(p.productName),
      variantName: str(p.variantName),
      sku: str(p.sku),
      barcode: (p.barcode as string | null) ?? null,
    });
    return;
  }
  if (change.entityType === "product_sku_barcode") {
    const productSkuId = str(p.productSkuId);
    if (change.operation === "DELETE") {
      deleteSkuBarcodeLocal(change.entityId, productSkuId);
    } else {
      upsertSkuBarcodeLocal({
        id: change.entityId,
        productSkuId,
        barcode: str(p.barcode),
        quantityMultiplier: Number(p.quantityMultiplier ?? 1),
        status: statusOf(p, change.operation),
      });
    }
    return;
  }
  if (change.entityType === "purchase_order") {
    const existing = getPurchaseOrderLocal(change.entityId);
    const items = Array.isArray(p.items)
      ? (p.items as PurchaseOrderDetail["items"])
      : (existing?.items ?? []);
    upsertPurchaseOrderLocal({
      id: change.entityId,
      poNumber: str(
        p.poNumber,
        existing?.poNumber ?? `LOCAL-${change.entityId.slice(0, 8)}`,
      ),
      vendorId: str(p.vendorId, existing?.vendorId ?? ""),
      vendorName: str(p.vendorName, existing?.vendorName ?? ""),
      warehouseId: str(p.warehouseId, existing?.warehouseId ?? ""),
      warehouseName: str(p.warehouseName, existing?.warehouseName ?? ""),
      status: str(
        p.status,
        existing?.status ?? "DRAFT",
      ) as PurchaseOrderDetail["status"],
      orderDate: str(p.orderDate, existing?.orderDate ?? now.slice(0, 10)),
      expectedDate:
        p.expectedDate !== undefined
          ? ((p.expectedDate as string | null) ?? null)
          : (existing?.expectedDate ?? null),
      subtotal: Number(p.subtotal ?? existing?.subtotal ?? 0),
      discount: Number(p.discount ?? existing?.discount ?? 0),
      tax: Number(p.tax ?? existing?.tax ?? 0),
      otherCharges: Number(p.otherCharges ?? existing?.otherCharges ?? 0),
      total: Number(p.total ?? existing?.total ?? 0),
      notes: p.notes != null ? str(p.notes) : (existing?.notes ?? ""),
      items,
      createdAt: str(p.createdAt, existing?.createdAt ?? now),
      updatedAt: str(p.updatedAt, now),
    });
    return;
  }
  if (change.entityType === "goods_receipt") {
    upsertGoodsReceiptLocal({
      id: change.entityId,
      receiptNumber: str(p.receiptNumber, `LOCAL-${change.entityId.slice(0, 8)}`),
      purchaseOrderId: str(p.purchaseOrderId),
      poNumber: str(p.poNumber),
      vendorId: (p.vendorId as string | null) ?? null,
      vendorName: (p.vendorName as string | null) ?? null,
      warehouseId: str(p.warehouseId),
      warehouseName: str(p.warehouseName),
      status: str(p.status, "POSTED") as GoodsReceiptDetail["status"],
      receivedAt: (p.receivedAt as string | null) ?? now,
      voucherNumber: (p.voucherNumber as string | null) ?? null,
      subtotal: Number(p.subtotal ?? 0),
      discount: Number(p.discount ?? 0),
      saleTax: Number(p.saleTax ?? p.tax ?? 0),
      advTax: Number(p.advTax ?? 0),
      gst: Number(p.gst ?? 0),
      incentive: Number(p.incentive ?? 0),
      shelfRent: Number(p.shelfRent ?? 0),
      tax: Number(p.saleTax ?? p.tax ?? 0),
      otherCharges: 0,
      returnCredit: Number(p.returnCredit ?? 0),
      total: Number(p.total ?? 0),
      notes: "",
      items: Array.isArray(p.items)
        ? (p.items as GoodsReceiptDetail["items"])
        : [],
      createdAt: str(p.createdAt, now),
      updatedAt: str(p.updatedAt, now),
    });
    return;
  }
  if (change.entityType === "inventory_out") {
    const db = getLocalDb();
    const existed = db
      .prepare(`select 1 from inventory_outs where id = ? limit 1`)
      .get(change.entityId);
    const items = Array.isArray(p.items)
      ? (p.items as InventoryOutDetail["items"])
      : [];
    upsertInventoryOutLocal({
      id: change.entityId,
      outNumber: str(p.outNumber, `LOCAL-${change.entityId.slice(0, 8)}`),
      warehouseId: str(p.warehouseId),
      warehouseName: str(p.warehouseName),
      outDate: str(p.outDate, now.slice(0, 10)),
      reference: (p.reference as string | null) ?? null,
      notes: str(p.notes),
      status: str(p.status, "POSTED") as InventoryOutDetail["status"],
      subtotal: Number(p.subtotal ?? 0),
      total: Number(p.total ?? 0),
      items,
      createdAt: str(p.createdAt, now),
      updatedAt: str(p.updatedAt, now),
    });
    if (!existed) {
      const warehouseId = str(p.warehouseId);
      for (const item of items) {
        applyInventoryOutBalanceDeltaLocal(
          warehouseId,
          item.productSkuId,
          item.quantity,
          item.unitCost,
        );
      }
    }
    return;
  }
  if (change.entityType === "inventory_out_return") {
    const db = getLocalDb();
    const existed = db
      .prepare(`select 1 from inventory_out_returns where id = ? limit 1`)
      .get(change.entityId);
    const items = Array.isArray(p.items)
      ? (p.items as InventoryOutReturnDetail["items"])
      : [];
    upsertInventoryOutReturnLocal({
      id: change.entityId,
      returnNumber: str(p.returnNumber, `LOCAL-${change.entityId.slice(0, 8)}`),
      warehouseId: str(p.warehouseId),
      warehouseName: str(p.warehouseName),
      returnDate: str(p.returnDate, now.slice(0, 10)),
      notes: str(p.notes),
      status: str(p.status, "POSTED") as InventoryOutReturnDetail["status"],
      subtotal: Number(p.subtotal ?? 0),
      total: Number(p.total ?? 0),
      items,
      createdAt: str(p.createdAt, now),
      updatedAt: str(p.updatedAt, now),
    });
    if (!existed) {
      const warehouseId = str(p.warehouseId);
      for (const item of items) {
        applyInventoryOutBalanceDeltaLocal(
          warehouseId,
          item.productSkuId,
          -item.quantity,
          item.unitCost,
        );
      }
    }
    return;
  }
  if (change.entityType === "sale") {
    const db = getLocalDb();
    const existing = db
      .prepare(`select status from sales where id = ? limit 1`)
      .get(change.entityId) as { status: string } | undefined;
    const prevStatus = existing?.status;
    const items = Array.isArray(p.items) ? (p.items as SaleDetail["items"]) : [];
    const payments = Array.isArray(p.payments)
      ? (p.payments as SaleDetail["payments"])
      : [];
    const status = str(p.status, "POSTED") as SaleDetail["status"];
    const warehouseId = str(p.warehouseId);

    upsertSaleLocal({
      id: change.entityId,
      saleNumber: str(p.saleNumber, `LOCAL-${change.entityId.slice(0, 8)}`),
      warehouseId,
      warehouseName: str(p.warehouseName),
      status,
      subtotal: Number(p.subtotal ?? 0),
      gstRate: Number(p.gstRate ?? 0),
      gstAmount: Number(p.gstAmount ?? 0),
      salesTaxRate: Number(p.salesTaxRate ?? 0),
      salesTaxAmount: Number(p.salesTaxAmount ?? 0),
      total: Number(p.total ?? 0),
      notes: str(p.notes),
      customerName: str(p.customerName, "CASH SALES CUSTOMER"),
      cashTendered:
        p.cashTendered != null && p.cashTendered !== ""
          ? Number(p.cashTendered)
          : null,
      deviceId: (p.deviceId as string | null) ?? null,
      postedBy: (p.postedBy as string | null) ?? null,
      postedByName: (p.postedByName as string | null) ?? null,
      postedAt: (p.postedAt as string | null) ?? null,
      items,
      payments,
      createdAt: str(p.createdAt, now),
      updatedAt: str(p.updatedAt, now),
    });

    if (status === "POSTED" && prevStatus !== "POSTED") {
      for (const item of items) {
        const balanceRow = db
          .prepare(
            `select unit_cost as unitCost from inventory_out_items
             where tenant_id = @tenantId and warehouse_id = @warehouseId
               and product_sku_id = @productSkuId`,
          )
          .get({
            tenantId: DEMO_STORE_TENANT_ID,
            warehouseId,
            productSkuId: item.productSkuId,
          }) as { unitCost: number } | undefined;
        const unitCost = balanceRow ? Number(balanceRow.unitCost) : item.unitPrice;
        applyInventoryOutBalanceDeltaLocal(
          warehouseId,
          item.productSkuId,
          -item.quantity,
          unitCost,
        );
      }
    }

    if (status === "VOID" && prevStatus === "POSTED") {
      for (const item of items) {
        applyInventoryOutBalanceDeltaLocal(
          warehouseId,
          item.productSkuId,
          item.quantity,
          item.unitPrice,
        );
      }
    }
    return;
  }
  if (change.entityType === "till_session") {
    upsertTillSessionLocal({
      id: change.entityId,
      userId: str(p.userId),
      userName: str(p.userName),
      status: str(p.status, "OPEN") as TillSessionDetail["status"],
      note10: Number(p.note10 ?? 0),
      note20: Number(p.note20 ?? 0),
      note50: Number(p.note50 ?? 0),
      note100: Number(p.note100 ?? 0),
      note500: Number(p.note500 ?? 0),
      note1000: Number(p.note1000 ?? 0),
      note5000: Number(p.note5000 ?? 0),
      openingTotal: Number(p.openingTotal ?? 0),
      openingBalance: Number(p.openingBalance ?? 0),
      currentCashBalance: Number(p.currentCashBalance ?? 0),
      maxCashLimit: Number(p.maxCashLimit ?? 0),
      openedAt: (p.openedAt as string | null | undefined) ?? null,
      closedAt: (p.closedAt as string | null | undefined) ?? null,
      approvedByUserId: (p.approvedByUserId as string | null | undefined) ?? null,
      approvedByName: (p.approvedByName as string | null | undefined) ?? null,
      approvedAt: (p.approvedAt as string | null | undefined) ?? null,
      reopenedByUserId: (p.reopenedByUserId as string | null | undefined) ?? null,
      reopenedByName: (p.reopenedByName as string | null | undefined) ?? null,
      closeReason: (p.closeReason as string | null | undefined) ?? null,
      createdAt: str(p.createdAt, now),
      updatedAt: str(p.updatedAt, now),
    });
    return;
  }
  if (change.entityType === "vendor_return") {
    upsertVendorReturnLocal({
      id: change.entityId,
      returnNumber: str(p.returnNumber, `LOCAL-${change.entityId.slice(0, 8)}`),
      vendorId: str(p.vendorId),
      vendorName: str(p.vendorName),
      warehouseId: str(p.warehouseId),
      warehouseName: str(p.warehouseName),
      returnDate: str(p.returnDate, now.slice(0, 10)),
      notes: str(p.notes),
      status: str(p.status, "OPEN") as VendorReturnDetail["status"],
      subtotal: Number(p.subtotal ?? 0),
      total: Number(p.total ?? 0),
      items: Array.isArray(p.items)
        ? (p.items as VendorReturnDetail["items"])
        : [],
      createdAt: str(p.createdAt, now),
      updatedAt: str(p.updatedAt, now),
    });
    return;
  }
  if (change.entityType === "inventory_movement") {
    const qty = Number(p.quantity ?? 0);
    const signed =
      p.delta != null
        ? Number(p.delta)
        : String(p.movementType) === "INVENTORY_OUT" ||
            String(p.movementType) === "RETURN"
          ? -qty
          : qty;
    upsertInventoryMovementLocal({
      id: change.entityId,
      productSkuId: str(p.productSkuId),
      sku: str(p.sku),
      variantName: str(p.variantName),
      warehouseId: str(p.warehouseId),
      warehouseName: str(p.warehouseName),
      movementType: String(p.movementType ?? "STOCK_ADJUSTMENT") as never,
      quantity: qty,
      referenceType: (p.referenceType as string | null) ?? null,
      referenceId: (p.referenceId as string | null) ?? null,
      reason: str(p.reason),
      createdAt: str(p.createdAt, now),
    });
    applyStockDeltaLocal(str(p.productSkuId), str(p.warehouseId), signed);
  }
}

function namedTaxonomy(p: Record<string, unknown>, id: string) {
  return {
    id,
    name: str(p.name),
    description: str(p.description),
    status: statusOf(p, "UPSERT"),
  };
}

function statusOf(
  p: Record<string, unknown>,
  operation: string,
): "active" | "inactive" {
  if (operation === "DELETE") return "inactive";
  return p.status === "inactive" ? "inactive" : "active";
}

function str(value: unknown, fallback = ""): string {
  return value == null ? fallback : String(value);
}

function numOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  return Number(value);
}
