import type {
  Brand,
  Category,
  GoodsReceiptDetail,
  InventoryOutDetail,
  ProductDetail,
  PurchaseOrderDetail,
  SyncChangeDto,
  SyncEntityType,
  SyncOperation,
  SyncStream,
  UnitListItem,
  VendorDetail,
  VendorGroup,
} from "@blackbox/shared";
import { getLocalDb } from "./index";
import { readIdentity } from "./identity";
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
import { upsertPurchaseOrderLocal } from "./purchase-orders-local";
import { upsertGoodsReceiptLocal } from "./goods-receipts-local";
import { upsertInventoryOutLocal } from "./inventory-out-local";
import { getPurchaseOrderLocal } from "./entity-get-local";

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
        recordApplied(change.changeId, Number(change.seq), change.stream);
        continue;
      }
      applyChange(change);
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
    changeId = enqueueOutbox(input);
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
      tax: Number(p.tax ?? 0),
      otherCharges: Number(p.otherCharges ?? 0),
      total: Number(p.total ?? 0),
      notes: str(p.notes),
      items: Array.isArray(p.items)
        ? (p.items as GoodsReceiptDetail["items"])
        : [],
      createdAt: str(p.createdAt, now),
      updatedAt: str(p.updatedAt, now),
    });
    return;
  }
  if (change.entityType === "inventory_out") {
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
      items: Array.isArray(p.items)
        ? (p.items as InventoryOutDetail["items"])
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
        : String(p.movementType) === "INVENTORY_OUT"
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
