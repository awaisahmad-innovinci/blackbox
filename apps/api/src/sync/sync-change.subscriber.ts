import { Injectable } from "@nestjs/common";
import {
  DataSource,
  EntitySubscriberInterface,
  EntityTarget,
  EventSubscriber,
  InsertEvent,
  UpdateEvent,
} from "typeorm";
import type { SyncEntityType } from "@blackbox/shared";
import {
  Brand,
  Category,
  GoodsReceipt,
  InventoryMovement,
  InventoryOut,
  Product,
  ProductSku,
  ProductSkuBarcode,
  PurchaseOrder,
  Unit,
  Vendor,
  VendorGroup,
  VendorReturn,
  VendorSku,
  Warehouse,
} from "../db/entities";
import { getRequestTenant } from "../common/request-tenant";
import { SyncService } from "./sync.service";

const ENTITY_TYPES = new Map<EntityTarget<object>, SyncEntityType>([
  [Unit, "unit"],
  [Brand, "brand"],
  [Category, "category"],
  [Warehouse, "warehouse"],
  [VendorGroup, "vendor_group"],
  [Product, "product"],
  [ProductSku, "product_sku"],
  [ProductSkuBarcode, "product_sku_barcode"],
  [Vendor, "vendor"],
  [VendorSku, "vendor_sku"],
  [PurchaseOrder, "purchase_order"],
  [GoodsReceipt, "goods_receipt"],
  [InventoryOut, "inventory_out"],
  [VendorReturn, "vendor_return"],
  [InventoryMovement, "inventory_movement"],
]);

@Injectable()
@EventSubscriber()
export class SyncChangeSubscriber implements EntitySubscriberInterface {
  constructor(
    dataSource: DataSource,
    private readonly sync: SyncService,
  ) {
    dataSource.subscribers.push(this);
  }

  afterInsert(event: InsertEvent<object>): void {
    const target = event.metadata.target;
    if (typeof target !== "function") return;
    void this.publish(event.entity, target, "insert");
  }

  afterUpdate(event: UpdateEvent<object>): void {
    const target = event.metadata.target;
    if (typeof target !== "function") return;
    void this.publish(event.entity, target, "update");
  }

  private async publish(
    entity: object | undefined,
    target: EntityTarget<object>,
    kind: "insert" | "update",
  ): Promise<void> {
    if (getRequestTenant()?.skipSyncPublish) return;
    if (!entity || typeof entity !== "object") return;
    const entityType = ENTITY_TYPES.get(target);
    if (!entityType) return;
    const record = entity as { id?: string; status?: string };
    if (!record.id) return;
    const operation =
      entityType === "inventory_movement"
        ? "EVENT"
        : kind === "update" && record.status === "inactive"
          ? "DELETE"
          : "UPSERT";
    await this.sync.publishFromRest({
      entityType,
      entityId: record.id,
      operation,
      payload: { ...record } as Record<string, unknown>,
    });
  }
}
