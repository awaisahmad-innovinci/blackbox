import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import {
  SYNC_PULL_BATCH_SIZE,
  SYNC_STREAMS,
  goodsReceiptCostCharges,
  goodsReceiptCostCredits,
  landedUnitByQuantity,
  roundMoney4,
  streamForEntity,
  weightedAvgUnitCost,
  type SyncChangeDto,
  type SyncEntityType,
  type SyncPushItemResult,
  type SyncPushResponse,
  type SyncPullResponse,
  type SyncStatusResponse,
  type SyncStream,
} from "@blackbox/shared";
import {
  normalizeOptionalStoredText,
  normalizeStoredText,
} from "@blackbox/shared";
import { DataSource, EntityManager, IsNull, Repository } from "typeorm";
import { randomUUID } from "node:crypto";
import { getRequestTenant, requestTenantAls } from "../common/request-tenant";
import type { TenantContext } from "../common/tenant-context";
import {
  Brand,
  Category,
  Device,
  DeviceUser,
  GoodsReceipt,
  GoodsReceiptItem,
  InventoryMovement,
  InventoryOut,
  InventoryOutLine,
  InventoryOutItem,
  InventoryOutReturn,
  InventoryOutReturnItem,
  Sale,
  SaleLine,
  SalePayment,
  SaleReturn,
  SaleReturnLine,
  InventoryStock,
  Product,
  ProductSku,
  ProductSkuBarcode,
  PurchaseOrder,
  PurchaseOrderItem,
  SyncChange,
  SyncConflict,
  SyncCursor,
  Unit,
  Vendor,
  VendorContact,
  VendorGroup,
  VendorReturn,
  VendorReturnItem,
  VendorSku,
  Warehouse,
} from "../db/entities";
import { applyInventoryOutBalanceDelta } from "../inventory/inventory-out/inventory-out-balance";
import type { SyncChangeInputDto, SyncPushDto } from "./dto/sync.dto";

const RETENTION_DAYS = 90;
const STALE_DEVICE_DAYS = 30;
const HUB_FINGERPRINT = "cloud-hub";

@Injectable()
export class SyncService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Device) private readonly devices: Repository<Device>,
    @InjectRepository(DeviceUser)
    private readonly deviceUsers: Repository<DeviceUser>,
    @InjectRepository(SyncChange)
    private readonly changes: Repository<SyncChange>,
    @InjectRepository(SyncCursor)
    private readonly cursors: Repository<SyncCursor>,
    @InjectRepository(SyncConflict)
    private readonly conflicts: Repository<SyncConflict>,
  ) {}

  async push(
    user: TenantContext,
    dto: SyncPushDto,
  ): Promise<SyncPushResponse> {
    const device = await this.requireTrustedDevice(user);
    const results: SyncPushItemResult[] = [];

    for (const item of dto.changes) {
      const expectedStream = streamForEntity(item.entityType as SyncEntityType);
      if (expectedStream !== dto.stream) {
        results.push({
          changeId: item.changeId,
          status: "rejected",
          message: `Entity ${item.entityType} does not belong to stream ${dto.stream}`,
        });
        continue;
      }
      results.push(await this.applyPushItem(user, device, dto.stream, item));
    }

    await this.touchDevice(device.id, user.tenantId, null);
    return { results };
  }

  async pull(
    user: TenantContext,
    stream: string,
    cursorRaw: string | undefined,
    limitRaw: string | undefined,
  ): Promise<SyncPullResponse> {
    const device = await this.requireTrustedDevice(user);
    if (!SYNC_STREAMS.includes(stream as SyncStream)) {
      throw new BadRequestException("Unknown sync stream");
    }
    const limit = Math.min(
      Math.max(Number(limitRaw) || SYNC_PULL_BATCH_SIZE, 1),
      SYNC_PULL_BATCH_SIZE,
    );
    const cursor = Number(cursorRaw || "0");
    if (!Number.isFinite(cursor) || cursor < 0) {
      throw new BadRequestException("Invalid cursor");
    }

    const serverHead = await this.serverSeq(user.tenantId);
    if (device.needsFullResync) {
      return {
        changes: [],
        nextCursor: String(cursor),
        hasMore: false,
        serverSeq: String(serverHead),
      };
    }

    const minSeq = await this.minRetainedSeq(user.tenantId);
    if (cursor > 0 && cursor < minSeq) {
      device.needsFullResync = true;
      await this.devices.save(device);
      return {
        changes: [],
        nextCursor: String(cursor),
        hasMore: false,
        serverSeq: String(serverHead),
      };
    }

    const foreignOrigin =
      "(c.origin_device_id IS NULL OR c.origin_device_id != :deviceId)";

    const firstForeignRaw = await this.changes
      .createQueryBuilder("c")
      .select("MIN(c.seq)", "minSeq")
      .where("c.tenant_id = :tenantId", { tenantId: user.tenantId })
      .andWhere("c.stream = :stream", { stream })
      .andWhere("c.seq > :cursor", { cursor })
      .andWhere(foreignOrigin, { deviceId: device.id })
      .getRawOne<{ minSeq: string | null }>();

    const firstForeignSeq = firstForeignRaw?.minSeq
      ? Number(firstForeignRaw.minSeq)
      : null;

    if (firstForeignSeq === null || !Number.isFinite(firstForeignSeq)) {
      const maxRaw = await this.changes
        .createQueryBuilder("c")
        .select("MAX(c.seq)", "maxSeq")
        .where("c.tenant_id = :tenantId", { tenantId: user.tenantId })
        .andWhere("c.stream = :stream", { stream })
        .andWhere("c.seq > :cursor", { cursor })
        .getRawOne<{ maxSeq: string | null }>();
      const maxSeq = maxRaw?.maxSeq ? Number(maxRaw.maxSeq) : cursor;
      const nextCursor = String(
        Number.isFinite(maxSeq) && maxSeq > cursor ? maxSeq : cursor,
      );

      await this.upsertCursor(user.tenantId, device.id, stream, String(cursor));
      await this.touchDevice(device.id, user.tenantId, null);

      return {
        changes: [],
        nextCursor,
        hasMore: false,
        serverSeq: String(serverHead),
      };
    }

    const rows = await this.changes
      .createQueryBuilder("c")
      .where("c.tenant_id = :tenantId", { tenantId: user.tenantId })
      .andWhere("c.stream = :stream", { stream })
      .andWhere("c.seq >= :firstForeignSeq", { firstForeignSeq })
      .andWhere(foreignOrigin, { deviceId: device.id })
      .orderBy("c.seq", "ASC")
      .take(limit + 1)
      .getMany();

    const hasMoreInPage = rows.length > limit;
    const page = hasMoreInPage ? rows.slice(0, limit) : rows;
    const nextCursor =
      page.length > 0 ? String(page[page.length - 1]!.seq) : String(cursor);

    let hasMore = hasMoreInPage;
    if (!hasMore && page.length > 0) {
      const lastSeq = page[page.length - 1]!.seq;
      const moreForeign = await this.changes
        .createQueryBuilder("c")
        .where("c.tenant_id = :tenantId", { tenantId: user.tenantId })
        .andWhere("c.stream = :stream", { stream })
        .andWhere("c.seq > :lastSeq", { lastSeq })
        .andWhere(foreignOrigin, { deviceId: device.id })
        .getCount();
      hasMore = moreForeign > 0;
    }

    await this.upsertCursor(user.tenantId, device.id, stream, String(cursor));
    await this.touchDevice(device.id, user.tenantId, null);

    return {
      changes: page.map((row) => this.toDto(row)),
      nextCursor,
      hasMore,
      serverSeq: String(serverHead),
    };
  }

  async status(user: TenantContext): Promise<SyncStatusResponse> {
    const device = await this.requireDevice(user);
    const serverHead = await this.serverSeq(user.tenantId);
    const streams = await Promise.all(
      SYNC_STREAMS.map(async (stream) => {
        const cursor = await this.cursors.findOne({
          where: { tenantId: user.tenantId, deviceId: device.id, stream },
        });
        const deviceCursor = Number(cursor?.cursor || "0");
        const pendingConflicts = await this.conflicts.count({
          where: {
            tenantId: user.tenantId,
            deviceId: device.id,
            stream,
            resolution: "pending",
          },
        });
        return {
          stream,
          serverSeq: String(serverHead),
          deviceCursor: String(deviceCursor),
          lag: Math.max(serverHead - deviceCursor, 0),
          pendingConflicts,
        };
      }),
    );
    return {
      tenantId: user.tenantId,
      deviceId: device.id,
      deviceStatus: device.status,
      lastSyncAt: device.lastSyncAt?.toISOString() ?? null,
      lastError: device.lastSyncError,
      needsFullResync: device.needsFullResync,
      streams,
    };
  }

  /**
   * Clears `needs_full_resync` after the device rebuilt its local database
   * from REST. Without this the flag would keep `pull` returning empty pages.
   */
  async completeFullResync(user: TenantContext): Promise<{ ok: true }> {
    const device = await this.requireTrustedDevice(user);
    device.needsFullResync = false;
    device.lastSyncAt = new Date();
    device.lastSyncError = null;
    await this.devices.save(device);
    return { ok: true };
  }

  async ackConflict(
    user: TenantContext,
    conflictId: string,
    resolution: "accepted_local" | "accepted_cloud" | "merged",
  ): Promise<{ ok: true }> {
    const device = await this.requireTrustedDevice(user);
    const row = await this.conflicts.findOne({
      where: { id: conflictId, tenantId: user.tenantId, deviceId: device.id },
    });
    if (!row) {
      throw new BadRequestException("Conflict not found");
    }
    row.resolution = resolution;
    row.resolvedAt = new Date();
    await this.conflicts.save(row);
    return { ok: true };
  }

  async publishFromRest(input: {
    entityType: SyncEntityType;
    entityId: string;
    operation: "UPSERT" | "DELETE" | "EVENT";
    payload: Record<string, unknown>;
  }): Promise<void> {
    if (getRequestTenant()?.skipSyncPublish) return;
    const tenantId =
      getRequestTenant()?.tenantId ??
      (input.payload.tenantId as string | undefined);
    if (!tenantId) return;
    const originDeviceId =
      getRequestTenant()?.deviceId ?? (await this.hubDeviceId(tenantId));
    if (!originDeviceId) return;

    await this.dataSource.transaction(async (manager) => {
      await this.insertChange(manager, {
        tenantId,
        originDeviceId,
        changeId: randomUUID(),
        stream: streamForEntity(input.entityType),
        entityType: input.entityType,
        entityId: input.entityId,
        operation: input.operation,
        payload: input.payload,
        baseEntityVersion: 0,
      });
    });
  }

  async retainHistory(): Promise<{ deleted: number }> {
    const staleBefore = new Date(
      Date.now() - STALE_DEVICE_DAYS * 24 * 60 * 60 * 1000,
    );
    const active = await this.devices.find({
      where: { status: "trusted" },
    });
    const live: Device[] = [];
    for (const device of active) {
      if (device.fingerprint === HUB_FINGERPRINT) continue;
      const silent =
        !device.lastSyncAt || device.lastSyncAt < staleBefore;
      if (silent || device.needsFullResync) {
        if (!device.needsFullResync) {
          device.needsFullResync = true;
          await this.devices.save(device);
        }
        continue;
      }
      live.push(device);
    }
    let minCursor = Number.POSITIVE_INFINITY;
    for (const device of live) {
      const rows = await this.cursors.find({
        where: { tenantId: device.tenantId, deviceId: device.id },
      });
      for (const row of rows) {
        minCursor = Math.min(minCursor, Number(row.cursor || "0"));
      }
    }
    const cutoffDate = new Date(
      Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );
    const result = await this.changes
      .createQueryBuilder()
      .delete()
      .where("created_at < :cutoffDate", { cutoffDate })
      .andWhere("seq < :minCursor", {
        minCursor: Number.isFinite(minCursor) ? minCursor : 0,
      })
      .execute();
    return { deleted: result.affected ?? 0 };
  }

  private async applyPushItem(
    user: TenantContext,
    device: Device,
    stream: SyncStream,
    item: SyncChangeInputDto,
  ): Promise<SyncPushItemResult> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const existing = await manager.findOne(SyncChange, {
          where: { tenantId: user.tenantId, changeId: item.changeId },
        });
        if (existing) {
          return {
            changeId: item.changeId,
            status: "duplicate",
            seq: String(existing.seq),
          };
        }

        if (item.operation !== "EVENT") {
          const postedConflict = await this.postedDocumentConflict(
            manager,
            user.tenantId,
            item.entityType as SyncEntityType,
            item.entityId,
          );
          if (postedConflict) {
            await manager.save(
              manager.create(SyncConflict, {
                tenantId: user.tenantId,
                deviceId: device.id,
                stream,
                entityType: item.entityType,
                entityId: item.entityId,
                localChangeId: item.changeId,
                cloudChangeId: null,
                reason: "document already posted",
                localPayload: item.payload,
                cloudPayload: postedConflict,
                resolution: "pending",
              }),
            );
            return {
              changeId: item.changeId,
              status: "conflict",
              message: "Document is immutable after post",
            };
          }
          const head = await manager
            .createQueryBuilder(SyncChange, "c")
            .where("c.tenant_id = :tenantId", { tenantId: user.tenantId })
            .andWhere("c.entity_id = :entityId", { entityId: item.entityId })
            .orderBy("c.entity_version", "DESC")
            .getOne();
          const currentVersion = head?.entityVersion ?? 0;
          if (
            item.baseEntityVersion < currentVersion &&
            stream !== "inventory"
          ) {
            await manager.save(
              manager.create(SyncConflict, {
                tenantId: user.tenantId,
                deviceId: device.id,
                stream,
                entityType: item.entityType,
                entityId: item.entityId,
                localChangeId: item.changeId,
                cloudChangeId: head?.changeId ?? null,
                reason: "entity_version mismatch",
                localPayload: item.payload,
                cloudPayload: head?.payload ?? null,
                resolution: "pending",
              }),
            );
            return {
              changeId: item.changeId,
              status: "conflict",
              message: "Entity was updated on another device",
            };
          }
        }

        const saved = await this.insertChange(manager, {
          tenantId: user.tenantId,
          originDeviceId: device.id,
          changeId: item.changeId,
          stream,
          entityType: item.entityType,
          entityId: item.entityId,
          operation: item.operation,
          payload: item.payload,
          baseEntityVersion: item.baseEntityVersion,
        });
        await this.withSkipPublish(user, () =>
          this.applyToBusiness(manager, user.tenantId, {
            entityType: item.entityType as SyncEntityType,
            entityId: item.entityId,
            operation: item.operation,
            payload: item.payload,
          }),
        );
        return {
          changeId: item.changeId,
          status: "acked",
          seq: String(saved.seq),
        };
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Apply failed";
      return {
        changeId: item.changeId,
        status: "rejected",
        message,
        retryable: /not found|missing/i.test(message),
      };
    }
  }

  private async insertChange(
    manager: EntityManager,
    input: {
      tenantId: string;
      originDeviceId: string;
      changeId: string;
      stream: string;
      entityType: string;
      entityId: string;
      operation: string;
      payload: Record<string, unknown>;
      baseEntityVersion: number;
    },
  ): Promise<SyncChange> {
    await manager.query("select pg_advisory_xact_lock(hashtext($1))", [
      input.tenantId,
    ]);
    const head = await manager
      .createQueryBuilder(SyncChange, "c")
      .select("MAX(c.seq)", "max")
      .where("c.tenant_id = :tenantId", { tenantId: input.tenantId })
      .getRawOne<{ max: string | null }>();
    const seq = String(Number(head?.max ?? "0") + 1);
    const version =
      input.operation === "EVENT" ? 0 : input.baseEntityVersion + 1;
    const row = manager.create(SyncChange, {
      tenantId: input.tenantId,
      seq,
      changeId: input.changeId,
      originDeviceId: input.originDeviceId,
      stream: input.stream,
      entityType: input.entityType,
      entityId: input.entityId,
      operation: input.operation,
      entityVersion: version,
      payload: input.payload,
    });
    return manager.save(row);
  }

  private async applyToBusiness(
    manager: EntityManager,
    tenantId: string,
    change: {
      entityType: SyncEntityType;
      entityId: string;
      operation: string;
      payload: Record<string, unknown>;
    },
  ): Promise<void> {
    if (change.operation === "EVENT" && change.entityType === "inventory_movement") {
      const existing = await manager.findOne(InventoryMovement, {
        where: { id: change.entityId, tenantId },
      });
      if (existing) return;
      const qty = Number(change.payload.quantity ?? 0);
      const signed =
        change.payload.delta != null
          ? Number(change.payload.delta)
          : String(change.payload.movementType) === "INVENTORY_OUT" ||
              String(change.payload.movementType) === "RETURN"
            ? -qty
            : qty;
      const skuId = String(change.payload.productSkuId ?? "");
      const warehouseId = String(change.payload.warehouseId ?? "");
      if (!skuId || !warehouseId) {
        throw new Error("inventory_movement missing productSkuId/warehouseId");
      }
      await manager.save(
        manager.create(InventoryMovement, {
          id: change.entityId,
          tenantId,
          productSkuId: skuId,
          warehouseId,
          movementType: String(
            change.payload.movementType ?? "STOCK_ADJUSTMENT",
          ),
          quantity: String(qty),
          referenceType: (change.payload.referenceType as string) ?? null,
          referenceId: (change.payload.referenceId as string) ?? null,
          reason: String(change.payload.reason ?? ""),
        }),
      );
      let stock = await manager.findOne(InventoryStock, {
        where: { tenantId, productSkuId: skuId, warehouseId },
      });
      if (!stock) {
        stock = manager.create(InventoryStock, {
          tenantId,
          productSkuId: skuId,
          warehouseId,
          quantityOnHand: "0",
          quantityReserved: "0",
          quantityAvailable: "0",
        });
      }
      const next = Number(stock.quantityOnHand) + signed;
      if (next < 0) throw new Error("Insufficient stock");
      stock.quantityOnHand = String(next);
      stock.quantityAvailable = String(
        next - Number(stock.quantityReserved || 0),
      );
      await manager.save(stock);
      return;
    }

    const inactive = change.operation === "DELETE";
    const p = change.payload;
    switch (change.entityType) {
      case "unit":
        await this.upsertNamed(manager, Unit, { ...p, id: change.entityId, tenantId }, inactive);
        break;
      case "brand":
        await this.upsertNamed(manager, Brand, { ...p, id: change.entityId, tenantId }, inactive);
        break;
      case "category":
        await this.upsertNamed(manager, Category, { ...p, id: change.entityId, tenantId }, inactive);
        break;
      case "warehouse":
        await this.upsertNamed(manager, Warehouse, { ...p, id: change.entityId, tenantId }, inactive);
        break;
      case "vendor_group":
        await this.upsertNamed(manager, VendorGroup, { ...p, id: change.entityId, tenantId }, inactive);
        break;
      case "product": {
        if (p.brandId) {
          const brand = await manager.findOne(Brand, {
            where: { id: String(p.brandId), tenantId },
          });
          if (!brand) throw new Error("brand not found");
        }
        if (p.categoryId) {
          const category = await manager.findOne(Category, {
            where: { id: String(p.categoryId), tenantId },
          });
          if (!category) throw new Error("category not found");
        }
        const existing = await manager.findOne(Product, {
          where: { id: change.entityId, tenantId },
        });
        const row = existing ?? manager.create(Product, { id: change.entityId, tenantId });
        Object.assign(row, {
          name: normalizeStoredText(String(p.name ?? row.name ?? "")),
          productCode: p.productCode
            ? String(p.productCode)
            : (row.productCode ?? `SYNC-${change.entityId.slice(0, 8)}`),
          importKey: (p.importKey as string | null | undefined) ?? row.importKey ?? null,
          brandId: (p.brandId as string | null | undefined) ?? row.brandId ?? null,
          categoryId: (p.categoryId as string | null | undefined) ?? row.categoryId ?? null,
          productType: String(p.productType ?? row.productType ?? "STOCK_ITEM"),
          description: normalizeOptionalStoredText(
            String(p.description ?? row.description ?? ""),
          ),
          imagePath: (p.imagePath as string | null | undefined) ?? row.imagePath ?? null,
          status: inactive ? "inactive" : String(p.status ?? row.status ?? "active"),
        });
        await manager.save(row);
        break;
      }
      case "product_sku": {
        const productId = String(p.productId ?? "");
        const product = await manager.findOne(Product, {
          where: { id: productId, tenantId },
        });
        if (!product) throw new Error("product not found");
        const existing = await manager.findOne(ProductSku, {
          where: { id: change.entityId, tenantId },
        });
        const row = existing ?? manager.create(ProductSku, { id: change.entityId, tenantId });
        Object.assign(row, {
          productId,
          sku: String(p.sku ?? row.sku ?? ""),
          barcode: (p.barcode as string | null | undefined) ?? row.barcode ?? null,
          variantName: normalizeStoredText(String(p.variantName ?? row.variantName ?? "")),
          sizeValue: (p.sizeValue as string | null | undefined) ?? row.sizeValue ?? null,
          sizeUnit: (p.sizeUnit as string | null | undefined) ?? row.sizeUnit ?? null,
          baseUnitId: (p.baseUnitId as string | null | undefined) ?? row.baseUnitId ?? null,
          purchaseUnitId:
            (p.purchaseUnitId as string | null | undefined) ?? row.purchaseUnitId ?? null,
          unitsPerPurchaseUnit: String(p.unitsPerPurchaseUnit ?? row.unitsPerPurchaseUnit ?? 1),
          costPrice: String(p.costPrice ?? row.costPrice ?? 0),
          sellingPrice: String(p.sellingPrice ?? row.sellingPrice ?? 0),
          sellingPricePerPurchaseUnit:
            p.sellingPricePerPurchaseUnit == null
              ? row.sellingPricePerPurchaseUnit
              : String(p.sellingPricePerPurchaseUnit),
          saleDiscountPercent: String(
            p.saleDiscountPercent ?? row.saleDiscountPercent ?? 0,
          ),
          reorderLevel: String(p.reorderLevel ?? row.reorderLevel ?? 0),
          minimumStockLevel: String(p.minimumStockLevel ?? row.minimumStockLevel ?? 0),
          maximumStockLevel:
            p.maximumStockLevel == null
              ? row.maximumStockLevel
              : String(p.maximumStockLevel),
          trackInventory: Boolean(p.trackInventory ?? row.trackInventory ?? true),
          status: inactive ? "inactive" : String(p.status ?? row.status ?? "active"),
        });
        await manager.save(row);
        break;
      }
      case "product_sku_barcode": {
        const productSkuId = String(p.productSkuId ?? "");
        const sku = await manager.findOne(ProductSku, {
          where: { id: productSkuId, tenantId },
        });
        if (!sku) throw new Error("product sku not found");
        if (inactive) {
          await manager.delete(ProductSkuBarcode, {
            id: change.entityId,
            tenantId,
          });
        } else {
          const existing = await manager.findOne(ProductSkuBarcode, {
            where: { id: change.entityId, tenantId },
          });
          const row =
            existing ??
            manager.create(ProductSkuBarcode, { id: change.entityId, tenantId });
          Object.assign(row, {
            productSkuId,
            barcode: String(p.barcode ?? row.barcode ?? ""),
            quantityMultiplier: String(
              p.quantityMultiplier ?? row.quantityMultiplier ?? 1,
            ),
            status: String(p.status ?? row.status ?? "active"),
          });
          await manager.save(row);
        }
        const first = await manager.findOne(ProductSkuBarcode, {
          where: { tenantId, productSkuId, status: "active" },
          order: { createdAt: "ASC" },
        });
        await manager.update(
          ProductSku,
          { id: productSkuId, tenantId },
          { barcode: first?.barcode ?? null },
        );
        break;
      }
      case "vendor": {
        const existing = await manager.findOne(Vendor, {
          where: { id: change.entityId, tenantId },
        });
        const row = existing ?? manager.create(Vendor, { id: change.entityId, tenantId });
        Object.assign(row, {
          name: normalizeStoredText(String(p.name ?? row.name ?? "")),
          vendorCode: String(p.vendorCode ?? row.vendorCode ?? ""),
          groupId: (p.groupId as string | null | undefined) ?? row.groupId ?? null,
          address: (p.address as string | null | undefined) ?? row.address ?? null,
          city: (p.city as string | null | undefined) ?? row.city ?? null,
          state: (p.state as string | null | undefined) ?? row.state ?? null,
          country: (p.country as string | null | undefined) ?? row.country ?? null,
          postalCode: (p.postalCode as string | null | undefined) ?? row.postalCode ?? null,
          salesTarget:
            p.salesTarget == null ? row.salesTarget : String(p.salesTarget),
          creditLimit:
            p.creditLimit == null ? row.creditLimit : String(p.creditLimit),
          paymentTerms:
            (p.paymentTerms as string | null | undefined) ?? row.paymentTerms ?? null,
          taxNumber: (p.taxNumber as string | null | undefined) ?? row.taxNumber ?? null,
          notes: String(p.notes ?? row.notes ?? ""),
          status: inactive ? "inactive" : String(p.status ?? row.status ?? "active"),
        });
        await manager.save(row);
        if (Array.isArray(p.contacts)) {
          await manager.delete(VendorContact, {
            vendorId: change.entityId,
            tenantId,
          });
          for (const contact of p.contacts as Array<Record<string, unknown>>) {
            await manager.save(
              manager.create(VendorContact, {
                id: String(contact.id ?? randomUUID()),
                tenantId,
                vendorId: change.entityId,
                contactType: String(contact.contactType ?? "PRIMARY"),
                name: contact.name
                  ? normalizeStoredText(String(contact.name))
                  : null,
                phone: (contact.phone as string | null) ?? null,
                email: (contact.email as string | null) ?? null,
              }),
            );
          }
        }
        break;
      }
      case "vendor_sku": {
        const vendor = await manager.findOne(Vendor, {
          where: { id: String(p.vendorId ?? ""), tenantId },
        });
        if (!vendor) throw new Error("vendor not found");
        const sku = await manager.findOne(ProductSku, {
          where: { id: String(p.productSkuId ?? ""), tenantId },
        });
        if (!sku) throw new Error("product sku not found");
        const existing = await manager.findOne(VendorSku, {
          where: { id: change.entityId, tenantId },
        });
        const row = existing ?? manager.create(VendorSku, { id: change.entityId, tenantId });
        Object.assign(row, {
          vendorId: vendor.id,
          productSkuId: sku.id,
          vendorSkuCode: (p.vendorSkuCode as string | null | undefined) ?? row.vendorSkuCode ?? null,
          purchaseUnitId:
            (p.purchaseUnitId as string | null | undefined) ?? row.purchaseUnitId ?? null,
          unitsPerPurchaseUnit: String(p.unitsPerPurchaseUnit ?? row.unitsPerPurchaseUnit ?? 1),
          purchasePrice: String(p.purchasePrice ?? row.purchasePrice ?? 0),
          minimumOrderQuantity: String(
            p.minimumOrderQuantity ?? row.minimumOrderQuantity ?? 1,
          ),
          leadTimeDays: Number(p.leadTimeDays ?? row.leadTimeDays ?? 0),
          isPreferred: Boolean(p.isPreferred ?? row.isPreferred),
          status: inactive ? "inactive" : String(p.status ?? row.status ?? "active"),
          notes: String(p.notes ?? row.notes ?? ""),
        });
        await manager.save(row);
        break;
      }
      case "purchase_order": {
        await this.upsertPurchaseOrder(manager, tenantId, change.entityId, p);
        break;
      }
      case "goods_receipt": {
        await this.upsertGoodsReceipt(manager, tenantId, change.entityId, p);
        break;
      }
      case "inventory_out": {
        await this.upsertInventoryOut(manager, tenantId, change.entityId, p);
        break;
      }
      case "inventory_out_return": {
        await this.upsertInventoryOutReturn(manager, tenantId, change.entityId, p);
        break;
      }
      case "sale": {
        await this.upsertSale(manager, tenantId, change.entityId, p);
        break;
      }
      case "sale_return": {
        await this.upsertSaleReturn(manager, tenantId, change.entityId, p);
        break;
      }
      case "vendor_return": {
        await this.upsertVendorReturn(manager, tenantId, change.entityId, p);
        break;
      }
      default:
        break;
    }
  }

  private async postedDocumentConflict(
    manager: EntityManager,
    tenantId: string,
    entityType: SyncEntityType,
    entityId: string,
  ): Promise<Record<string, unknown> | null> {
    if (entityType === "purchase_order") {
      const row = await manager.findOne(PurchaseOrder, {
        where: { id: entityId, tenantId },
      });
      if (row && (row.status === "RECEIVED" || row.status === "CANCELLED")) {
        return { status: row.status };
      }
    }
    if (entityType === "goods_receipt") {
      const row = await manager.findOne(GoodsReceipt, {
        where: { id: entityId, tenantId },
      });
      if (row && row.status !== "DRAFT") {
        return { status: row.status };
      }
    }
    if (entityType === "inventory_out") {
      const row = await manager.findOne(InventoryOut, {
        where: { id: entityId, tenantId },
      });
      if (row && row.status === "POSTED") {
        return { status: row.status };
      }
    }
    if (entityType === "inventory_out_return") {
      const row = await manager.findOne(InventoryOutReturn, {
        where: { id: entityId, tenantId },
      });
      if (row && row.status === "POSTED") {
        return { status: row.status };
      }
    }
    if (entityType === "sale") {
      const row = await manager.findOne(Sale, {
        where: { id: entityId, tenantId },
      });
      if (row && (row.status === "POSTED" || row.status === "VOID")) {
        return { status: row.status };
      }
    }
    if (entityType === "sale_return") {
      const row = await manager.findOne(SaleReturn, {
        where: { id: entityId, tenantId },
      });
      if (row && row.status === "POSTED") {
        return { status: row.status };
      }
    }
    if (entityType === "vendor_return") {
      const row = await manager.findOne(VendorReturn, {
        where: { id: entityId, tenantId },
      });
      if (row && row.status === "SETTLED") {
        return { status: row.status };
      }
    }
    return null;
  }

  private async upsertPurchaseOrder(
    manager: EntityManager,
    tenantId: string,
    entityId: string,
    p: Record<string, unknown>,
  ): Promise<void> {
    const existing = await manager.findOne(PurchaseOrder, {
      where: { id: entityId, tenantId },
    });
    const row =
      existing ?? manager.create(PurchaseOrder, { id: entityId, tenantId });
    Object.assign(row, {
      poNumber: String(p.poNumber ?? row.poNumber ?? `SYNC-${entityId.slice(0, 8)}`),
      vendorId: String(p.vendorId ?? row.vendorId ?? ""),
      warehouseId: String(p.warehouseId ?? row.warehouseId ?? ""),
      status: String(p.status ?? row.status ?? "DRAFT"),
      orderDate: String(p.orderDate ?? row.orderDate ?? new Date().toISOString().slice(0, 10)),
      expectedDate: (p.expectedDate as string | null | undefined) ?? row.expectedDate ?? null,
      subtotal: String(p.subtotal ?? row.subtotal ?? 0),
      discount: String(p.discount ?? row.discount ?? 0),
      tax: String(p.tax ?? row.tax ?? 0),
      otherCharges: String(p.otherCharges ?? row.otherCharges ?? 0),
      total: String(p.total ?? row.total ?? 0),
      notes: String(p.notes ?? row.notes ?? ""),
    });
    if (!row.vendorId) throw new Error("vendor not found");
    if (!row.warehouseId) throw new Error("warehouse not found");
    await manager.save(row);
    if (Array.isArray(p.items)) {
      await manager.delete(PurchaseOrderItem, {
        purchaseOrderId: entityId,
        tenantId,
      });
      for (const item of p.items as Array<Record<string, unknown>>) {
        await manager.save(
          manager.create(PurchaseOrderItem, {
            id: String(item.id ?? randomUUID()),
            tenantId,
            purchaseOrderId: entityId,
            productSkuId: String(item.productSkuId ?? ""),
            vendorSkuId: (item.vendorSkuId as string | null) ?? null,
            purchaseUnitId: (item.purchaseUnitId as string | null) ?? null,
            unitsPerPurchaseUnit: String(item.unitsPerPurchaseUnit ?? 1),
            orderUnit: String(item.orderUnit ?? "box"),
            quantity: String(item.quantity ?? 0),
            unitCost: String(item.unitCost ?? 0),
            tax: String(item.tax ?? 0),
            discount: String(item.discount ?? 0),
            lineTotal: String(item.lineTotal ?? 0),
          }),
        );
      }
    }
  }

  private async upsertGoodsReceipt(
    manager: EntityManager,
    tenantId: string,
    entityId: string,
    p: Record<string, unknown>,
  ): Promise<void> {
    const existing = await manager.findOne(GoodsReceipt, {
      where: { id: entityId, tenantId },
    });
    const isNewPost = !existing || existing.status === "DRAFT";
    const row =
      existing ?? manager.create(GoodsReceipt, { id: entityId, tenantId });
    Object.assign(row, {
      receiptNumber: String(
        p.receiptNumber ?? row.receiptNumber ?? `SYNC-${entityId.slice(0, 8)}`,
      ),
      purchaseOrderId: String(p.purchaseOrderId ?? row.purchaseOrderId ?? ""),
      vendorId: (p.vendorId as string | null | undefined) ?? row.vendorId ?? null,
      warehouseId: String(p.warehouseId ?? row.warehouseId ?? ""),
      status: String(p.status ?? row.status ?? "POSTED"),
      receivedAt: p.receivedAt ? new Date(String(p.receivedAt)) : row.receivedAt,
      voucherNumber:
        (p.voucherNumber as string | null | undefined) ?? row.voucherNumber ?? null,
      subtotal: String(p.subtotal ?? row.subtotal ?? 0),
      discount: String(p.discount ?? row.discount ?? 0),
      tax: String(p.saleTax ?? p.tax ?? row.tax ?? 0),
      advTax: String(p.advTax ?? row.advTax ?? 0),
      gst: String(p.gst ?? row.gst ?? 0),
      incentive: String(p.incentive ?? row.incentive ?? 0),
      shelfRent: String(p.shelfRent ?? row.shelfRent ?? 0),
      otherCharges: "0",
      returnCredit: String(p.returnCredit ?? row.returnCredit ?? 0),
      total: String(p.total ?? row.total ?? 0),
      notes: "",
    });
    if (!row.purchaseOrderId) throw new Error("purchase order not found");
    await manager.save(row);
    const items = Array.isArray(p.items)
      ? (p.items as Array<Record<string, unknown>>)
      : [];
    if (items.length > 0) {
      await manager.delete(GoodsReceiptItem, {
        goodsReceiptId: entityId,
        tenantId,
      });
      for (const item of items) {
        await manager.save(
          manager.create(GoodsReceiptItem, {
            id: String(item.id ?? randomUUID()),
            tenantId,
            goodsReceiptId: entityId,
            purchaseOrderItemId: (item.purchaseOrderItemId as string | null) ?? null,
            productSkuId: String(item.productSkuId ?? ""),
            vendorSkuId: (item.vendorSkuId as string | null) ?? null,
            purchaseUnitId: (item.purchaseUnitId as string | null) ?? null,
            unitsPerPurchaseUnit: String(item.unitsPerPurchaseUnit ?? 1),
            orderedQuantity: String(item.orderedQuantity ?? 0),
            receivedQuantity: String(item.receivedQuantity ?? 0),
            bonusQuantity: String(item.bonusQuantity ?? 0),
            poUnitCost: String(item.poUnitCost ?? 0),
            receivingUnitCost: String(item.receivingUnitCost ?? 0),
            discountPercent: String(item.discountPercent ?? 0),
            lineTotal: String(item.lineTotal ?? 0),
          }),
        );
      }
    }
    if (isNewPost && row.status === "POSTED" && items.length > 0) {
      await this.applyReceiptAvgCost(manager, tenantId, entityId, items, {
        headerDiscount: Number(row.discount ?? 0),
        costCharges: goodsReceiptCostCharges({
          saleTax: Number(row.tax ?? 0),
          advTax: Number(row.advTax ?? 0),
          gst: Number(row.gst ?? 0),
        }),
        costCredits: goodsReceiptCostCredits({
          incentive: Number(row.incentive ?? 0),
        }),
      });
    }
    if (Array.isArray(p.returnAdjustments)) {
      await this.settleReturnAdjustments(
        manager,
        tenantId,
        entityId,
        p.returnAdjustments as Array<Record<string, unknown>>,
      );
    }
  }

  private async settleReturnAdjustments(
    manager: EntityManager,
    tenantId: string,
    receiptId: string,
    adjustments: Array<Record<string, unknown>>,
  ): Promise<void> {
    const touched = new Set<string>();
    for (const adj of adjustments) {
      const itemId = String(adj.vendorReturnItemId ?? "");
      const settlement = String(adj.settlement ?? "");
      if (!itemId || (settlement !== "CASHBACK" && settlement !== "REPLACE")) {
        continue;
      }
      const line = await manager.findOne(VendorReturnItem, {
        where: { id: itemId, tenantId },
      });
      if (!line || line.settlement) continue;
      line.settlement = settlement;
      line.goodsReceiptId = receiptId;
      await manager.save(line);
      touched.add(line.vendorReturnId);
    }
    for (const returnId of touched) {
      const open = await manager.count(VendorReturnItem, {
        where: { tenantId, vendorReturnId: returnId, settlement: IsNull() },
      });
      if (open === 0) {
        await manager.update(VendorReturn, { id: returnId, tenantId }, { status: "SETTLED" });
      }
    }
  }

  /** Updates SKU avg cost and vendor last price. Stock stays on inventory_movement. */
  private async applyReceiptAvgCost(
    manager: EntityManager,
    tenantId: string,
    receiptId: string,
    items: Array<Record<string, unknown>>,
    voucher: { headerDiscount: number; costCharges: number; costCredits: number },
  ): Promise<void> {
    const totalReceivedQty = items.reduce((sum, item) => {
      const qty = Number(item.receivedQuantity ?? 0);
      return sum + (qty > 0 ? qty : 0);
    }, 0);
    const running = new Map<
      string,
      { qty: number; cost: number }
    >();
    for (const item of items) {
      const productSkuId = String(item.productSkuId ?? "");
      if (!productSkuId) continue;
      const unitsPer = Number(item.unitsPerPurchaseUnit ?? 1) || 1;
      const received = Number(item.receivedQuantity ?? 0);
      const bonus = Number(item.bonusQuantity ?? 0);
      const billedDelta = roundMoney4(received * unitsPer);
      const stockDelta = roundMoney4(received * unitsPer + bonus);
      if (stockDelta <= 0) continue;

      let state = running.get(productSkuId);
      if (!state) {
        const productSku = await manager.findOne(ProductSku, {
          where: { id: productSkuId, tenantId },
        });
        if (!productSku) continue;
        const allStock = await manager.find(InventoryStock, {
          where: { tenantId, productSkuId },
        });
        const currentOnHand = roundMoney4(
          allStock.reduce((sum, row) => sum + Number(row.quantityOnHand ?? 0), 0),
        );
        const appliedMoves = await manager.find(InventoryMovement, {
          where: {
            tenantId,
            productSkuId,
            referenceType: "goods_receipt",
            referenceId: receiptId,
          },
        });
        const appliedQty = roundMoney4(
          appliedMoves.reduce((sum, row) => sum + Number(row.quantity ?? 0), 0),
        );
        state = {
          qty: roundMoney4(currentOnHand - appliedQty),
          cost: Number(productSku.costPrice ?? 0),
        };
        running.set(productSkuId, state);
      }

      if (billedDelta > 0) {
        const netUnitCost = landedUnitByQuantity(
          received,
          Number(item.receivingUnitCost ?? 0),
          Number(item.discountPercent ?? 0),
          totalReceivedQty,
          voucher.headerDiscount,
          voucher.costCharges,
          voucher.costCredits,
        );
        const newCost = roundMoney4(netUnitCost / unitsPer);
        state.cost = weightedAvgUnitCost(
          state.qty,
          state.cost,
          billedDelta,
          newCost,
        );
      }
      state.qty = roundMoney4(state.qty + stockDelta);

      const productSku = await manager.findOne(ProductSku, {
        where: { id: productSkuId, tenantId },
      });
      if (productSku) {
        productSku.costPrice = String(state.cost);
        await manager.save(productSku);
      }
    }
  }

  private async upsertVendorReturn(
    manager: EntityManager,
    tenantId: string,
    entityId: string,
    p: Record<string, unknown>,
  ): Promise<void> {
    const existing = await manager.findOne(VendorReturn, {
      where: { id: entityId, tenantId },
    });
    const row =
      existing ?? manager.create(VendorReturn, { id: entityId, tenantId });
    Object.assign(row, {
      returnNumber: String(
        p.returnNumber ?? row.returnNumber ?? `SYNC-${entityId.slice(0, 8)}`,
      ),
      vendorId: String(p.vendorId ?? row.vendorId ?? ""),
      warehouseId: String(p.warehouseId ?? row.warehouseId ?? ""),
      returnDate: String(
        p.returnDate ?? row.returnDate ?? new Date().toISOString().slice(0, 10),
      ),
      notes: String(p.notes ?? row.notes ?? ""),
      status: String(p.status ?? row.status ?? "OPEN"),
      subtotal: String(p.subtotal ?? row.subtotal ?? 0),
      total: String(p.total ?? row.total ?? 0),
    });
    if (!row.vendorId) throw new Error("vendor not found");
    if (!row.warehouseId) throw new Error("warehouse not found");
    await manager.save(row);
    if (Array.isArray(p.items)) {
      await manager.delete(VendorReturnItem, {
        vendorReturnId: entityId,
        tenantId,
      });
      for (const item of p.items as Array<Record<string, unknown>>) {
        await manager.save(
          manager.create(VendorReturnItem, {
            id: String(item.id ?? randomUUID()),
            tenantId,
            vendorReturnId: entityId,
            productSkuId: String(item.productSkuId ?? ""),
            vendorSkuId: (item.vendorSkuId as string | null) ?? null,
            purchaseUnitId: (item.purchaseUnitId as string | null) ?? null,
            unitsPerPurchaseUnit: String(item.unitsPerPurchaseUnit ?? 1),
            quantity: String(item.quantity ?? 0),
            unitCost: String(item.unitCost ?? 0),
            reason: String(item.reason ?? "OTHER"),
            settlement: (item.settlement as string | null) ?? null,
            goodsReceiptId: (item.goodsReceiptId as string | null) ?? null,
          }),
        );
      }
    }
  }

  private async upsertInventoryOut(
    manager: EntityManager,
    tenantId: string,
    entityId: string,
    p: Record<string, unknown>,
  ): Promise<void> {
    const existing = await manager.findOne(InventoryOut, {
      where: { id: entityId, tenantId },
    });
    const row =
      existing ?? manager.create(InventoryOut, { id: entityId, tenantId });
    Object.assign(row, {
      outNumber: String(p.outNumber ?? row.outNumber ?? `SYNC-${entityId.slice(0, 8)}`),
      warehouseId: String(p.warehouseId ?? row.warehouseId ?? ""),
      outDate: String(p.outDate ?? row.outDate ?? new Date().toISOString().slice(0, 10)),
      reference: (p.reference as string | null | undefined) ?? row.reference ?? null,
      notes: String(p.notes ?? row.notes ?? ""),
      status: String(p.status ?? row.status ?? "POSTED"),
      subtotal: String(p.subtotal ?? row.subtotal ?? 0),
      total: String(p.total ?? row.total ?? 0),
    });
    if (!row.warehouseId) throw new Error("warehouse not found");
    await manager.save(row);
    if (Array.isArray(p.items)) {
      await manager.delete(InventoryOutLine, {
        inventoryOutId: entityId,
        tenantId,
      });
      for (const item of p.items as Array<Record<string, unknown>>) {
        const qty = Number(item.quantity ?? 0);
        const unitCost = Number(item.unitCost ?? 0);
        const productSkuId = String(item.productSkuId ?? "");
        await manager.save(
          manager.create(InventoryOutLine, {
            id: String(item.id ?? randomUUID()),
            tenantId,
            inventoryOutId: entityId,
            productSkuId,
            quantity: String(qty),
            unitCost: String(unitCost),
          }),
        );
        if (productSkuId && qty > 0) {
          await applyInventoryOutBalanceDelta(
            manager,
            tenantId,
            row.warehouseId,
            productSkuId,
            qty,
            unitCost,
          );
        }
      }
    }
  }

  private async upsertInventoryOutReturn(
    manager: EntityManager,
    tenantId: string,
    entityId: string,
    p: Record<string, unknown>,
  ): Promise<void> {
    const existing = await manager.findOne(InventoryOutReturn, {
      where: { id: entityId, tenantId },
    });
    const row =
      existing ??
      manager.create(InventoryOutReturn, { id: entityId, tenantId });
    Object.assign(row, {
      returnNumber: String(
        p.returnNumber ?? row.returnNumber ?? `SYNC-${entityId.slice(0, 8)}`,
      ),
      warehouseId: String(p.warehouseId ?? row.warehouseId ?? ""),
      returnDate: String(
        p.returnDate ?? row.returnDate ?? new Date().toISOString().slice(0, 10),
      ),
      notes: String(p.notes ?? row.notes ?? ""),
      status: String(p.status ?? row.status ?? "POSTED"),
      subtotal: String(p.subtotal ?? row.subtotal ?? 0),
      total: String(p.total ?? row.total ?? 0),
    });
    if (!row.warehouseId) throw new Error("warehouse not found");
    await manager.save(row);
    if (Array.isArray(p.items)) {
      await manager.delete(InventoryOutReturnItem, {
        inventoryOutReturnId: entityId,
        tenantId,
      });
      for (const item of p.items as Array<Record<string, unknown>>) {
        const qty = Number(item.quantity ?? 0);
        const unitCost = Number(item.unitCost ?? 0);
        const productSkuId = String(item.productSkuId ?? "");
        await manager.save(
          manager.create(InventoryOutReturnItem, {
            id: String(item.id ?? randomUUID()),
            tenantId,
            inventoryOutReturnId: entityId,
            productSkuId,
            inventoryOutItemId: (item.inventoryOutItemId as string | null) ?? null,
            quantity: String(qty),
            unitCost: String(unitCost),
          }),
        );
        if (productSkuId && qty > 0) {
          await applyInventoryOutBalanceDelta(
            manager,
            tenantId,
            row.warehouseId,
            productSkuId,
            -qty,
            unitCost,
          );
        }
      }
    }
  }

  private async upsertSaleReturn(
    manager: EntityManager,
    tenantId: string,
    entityId: string,
    p: Record<string, unknown>,
  ): Promise<void> {
    const existing = await manager.findOne(SaleReturn, {
      where: { id: entityId, tenantId },
    });
    if (existing?.status === "POSTED") return;

    const row =
      existing ?? manager.create(SaleReturn, { id: entityId, tenantId });
    Object.assign(row, {
      returnNumber: String(
        p.returnNumber ?? row.returnNumber ?? `SYNC-${entityId.slice(0, 8)}`,
      ),
      saleId: String(p.saleId ?? row.saleId ?? ""),
      warehouseId: String(p.warehouseId ?? row.warehouseId ?? ""),
      returnDate: String(
        p.returnDate ?? row.returnDate ?? new Date().toISOString().slice(0, 10),
      ),
      status: String(p.status ?? row.status ?? "POSTED"),
      subtotal: String(p.subtotal ?? row.subtotal ?? 0),
      gstRate: String(p.gstRate ?? row.gstRate ?? 0),
      gstAmount: String(p.gstAmount ?? row.gstAmount ?? 0),
      salesTaxRate: String(p.salesTaxRate ?? row.salesTaxRate ?? 0),
      salesTaxAmount: String(p.salesTaxAmount ?? row.salesTaxAmount ?? 0),
      refundTotal: String(p.refundTotal ?? row.refundTotal ?? 0),
      refundMethod: String(p.refundMethod ?? row.refundMethod ?? "CASH"),
      notes: String(p.notes ?? row.notes ?? ""),
      processedBy: (p.processedBy as string | null | undefined) ?? row.processedBy ?? null,
    });
    if (!row.saleId) throw new Error("sale not found");
    if (!row.warehouseId) throw new Error("warehouse not found");
    await manager.save(row);

    if (Array.isArray(p.items)) {
      await manager.delete(SaleReturnLine, {
        saleReturnId: entityId,
        tenantId,
      });
      for (const item of p.items as Array<Record<string, unknown>>) {
        const qty = Number(item.quantity ?? 0);
        const productSkuId = String(item.productSkuId ?? "");
        const unitPrice = Number(item.unitPrice ?? 0);
        await manager.save(
          manager.create(SaleReturnLine, {
            id: String(item.id ?? randomUUID()),
            tenantId,
            saleReturnId: entityId,
            saleLineId: String(item.saleLineId ?? ""),
            productSkuId,
            quantity: String(qty),
            unitPrice: String(unitPrice),
            discountPercent: String(item.discountPercent ?? 0),
            lineTotal: String(item.lineTotal ?? 0),
            sellUnit: String(item.sellUnit ?? "pc"),
            barcode: (item.barcode as string | null | undefined) ?? null,
          }),
        );
        if (productSkuId && qty > 0 && !existing) {
          const balance = await manager.findOne(InventoryOutItem, {
            where: { tenantId, warehouseId: row.warehouseId, productSkuId },
          });
          const unitCost = balance
            ? Number(balance.unitCost ?? 0)
            : unitPrice;
          await applyInventoryOutBalanceDelta(
            manager,
            tenantId,
            row.warehouseId,
            productSkuId,
            qty,
            unitCost,
          );
          await manager.save(
            manager.create(InventoryMovement, {
              id: randomUUID(),
              tenantId,
              productSkuId,
              warehouseId: row.warehouseId,
              movementType: "SALE_RETURN",
              quantity: String(qty),
              referenceType: "sale_return",
              referenceId: entityId,
              reason: `Return ${row.returnNumber} for sale`,
            }),
          );
        }
      }
    }
  }

  private async upsertSale(
    manager: EntityManager,
    tenantId: string,
    entityId: string,
    p: Record<string, unknown>,
  ): Promise<void> {
    const existing = await manager.findOne(Sale, {
      where: { id: entityId, tenantId },
    });
    const row = existing ?? manager.create(Sale, { id: entityId, tenantId });
    const prevStatus = row.status;
    Object.assign(row, {
      saleNumber: String(
        p.saleNumber ?? row.saleNumber ?? `SYNC-${entityId.slice(0, 8)}`,
      ),
      warehouseId: String(p.warehouseId ?? row.warehouseId ?? ""),
      status: String(p.status ?? row.status ?? "POSTED"),
      subtotal: String(p.subtotal ?? row.subtotal ?? 0),
      gstRate: String(p.gstRate ?? row.gstRate ?? 0),
      gstAmount: String(p.gstAmount ?? row.gstAmount ?? 0),
      salesTaxRate: String(p.salesTaxRate ?? row.salesTaxRate ?? 0),
      salesTaxAmount: String(p.salesTaxAmount ?? row.salesTaxAmount ?? 0),
      total: String(p.total ?? row.total ?? 0),
      deviceId: (p.deviceId as string | null | undefined) ?? row.deviceId ?? null,
      postedBy: (p.postedBy as string | null | undefined) ?? row.postedBy ?? null,
      postedAt: p.postedAt ? new Date(String(p.postedAt)) : row.postedAt,
      customerName: String(
        p.customerName ?? row.customerName ?? "CASH SALES CUSTOMER",
      ),
      postedByName:
        (p.postedByName as string | null | undefined) ?? row.postedByName ?? null,
      cashTendered:
        p.cashTendered != null && p.cashTendered !== ""
          ? String(p.cashTendered)
          : row.cashTendered,
      notes: String(p.notes ?? row.notes ?? ""),
    });
    if (!row.warehouseId) throw new Error("warehouse not found");
    await manager.save(row);

    if (Array.isArray(p.items)) {
      await manager.delete(SaleLine, { saleId: entityId, tenantId });
      await manager.delete(SalePayment, { saleId: entityId, tenantId });

      for (const item of p.items as Array<Record<string, unknown>>) {
        const qty = Number(item.quantity ?? 0);
        const focQty = Math.max(0, Math.floor(Number(item.focQuantity ?? 0)));
        const inventoryQty = qty + focQty;
        const productSkuId = String(item.productSkuId ?? "");
        const unitPrice = Number(item.unitPrice ?? 0);
        await manager.save(
          manager.create(SaleLine, {
            id: String(item.id ?? randomUUID()),
            tenantId,
            saleId: entityId,
            productSkuId,
            quantity: String(qty),
            unitPrice: String(unitPrice),
            lineTotal: String(item.lineTotal ?? qty * unitPrice),
            discountPercent: String(item.discountPercent ?? 0),
            focQuantity: String(focQty),
            sellUnit: String(item.sellUnit ?? "pc"),
            barcode: (item.barcode as string | null | undefined) ?? null,
          }),
        );

        if (
          productSkuId &&
          inventoryQty > 0 &&
          row.status === "POSTED" &&
          prevStatus !== "POSTED"
        ) {
          const balance = await manager.findOne(InventoryOutItem, {
            where: { tenantId, warehouseId: row.warehouseId, productSkuId },
          });
          const unitCost = balance
            ? Number(balance.unitCost ?? 0)
            : unitPrice;
          await applyInventoryOutBalanceDelta(
            manager,
            tenantId,
            row.warehouseId,
            productSkuId,
            -inventoryQty,
            unitCost,
          );
        }
      }
    }

    if (Array.isArray(p.payments)) {
      for (const payment of p.payments as Array<Record<string, unknown>>) {
        await manager.save(
          manager.create(SalePayment, {
            id: String(payment.id ?? randomUUID()),
            tenantId,
            saleId: entityId,
            method: String(payment.method ?? "CASH"),
            amount: String(payment.amount ?? 0),
            reference: String(payment.reference ?? ""),
          }),
        );
      }
    }

    if (row.status === "VOID" && prevStatus === "POSTED" && Array.isArray(p.items)) {
      for (const item of p.items as Array<Record<string, unknown>>) {
        const qty = Number(item.quantity ?? 0);
        const productSkuId = String(item.productSkuId ?? "");
        if (!productSkuId || !(qty > 0)) continue;
        const balance = await manager.findOne(InventoryOutItem, {
          where: { tenantId, warehouseId: row.warehouseId, productSkuId },
        });
        const unitCost = balance
          ? Number(balance.unitCost ?? 0)
          : Number(item.unitPrice ?? 0);
        await applyInventoryOutBalanceDelta(
          manager,
          tenantId,
          row.warehouseId,
          productSkuId,
          qty,
          unitCost,
        );
      }
    }
  }

  private async upsertNamed(
    manager: EntityManager,
    entity: typeof Unit | typeof Brand | typeof Category | typeof Warehouse | typeof VendorGroup,
    payload: Record<string, unknown>,
    inactive: boolean,
  ): Promise<void> {
    const id = String(payload.id);
    const tenantId = String(payload.tenantId);
    const normalized = { ...payload };
    if (typeof normalized.name === "string") {
      normalized.name = normalizeStoredText(normalized.name);
    }
    if (typeof normalized.description === "string") {
      normalized.description = normalizeOptionalStoredText(normalized.description);
    }
    const existing = await manager.findOne(entity, {
      where: { id, tenantId },
    });
    const row = existing ?? manager.create(entity, { id, tenantId });
    Object.assign(row, normalized);
    if (inactive && "status" in row) {
      (row as { status: string }).status = "inactive";
    }
    await manager.save(row);
  }

  private async requireTrustedDevice(user: TenantContext): Promise<Device> {
    const device = await this.requireDevice(user);
    if (device.status !== "trusted") {
      throw new ForbiddenException("Device is not trusted");
    }
    const link = await this.deviceUsers.findOne({
      where: { deviceId: device.id, userId: user.userId },
    });
    if (!link?.offlineEnabled) {
      throw new ForbiddenException("User is not authorized for this device");
    }
    if (link.offlineExpiresAt && link.offlineExpiresAt.getTime() < Date.now()) {
      throw new ForbiddenException("Offline authorization expired");
    }
    link.lastOnlineAt = new Date();
    const next = new Date();
    next.setUTCDate(next.getUTCDate() + 7);
    link.offlineExpiresAt = next;
    await this.deviceUsers.save(link);
    return device;
  }

  private async requireDevice(user: TenantContext): Promise<Device> {
    if (!user.deviceId) {
      throw new UnauthorizedException("Device-bound session required");
    }
    if (!user.permissions.includes("sync.use")) {
      throw new ForbiddenException("Missing sync.use permission");
    }
    const device = await this.devices.findOne({
      where: { id: user.deviceId, tenantId: user.tenantId },
    });
    if (!device || device.status === "revoked") {
      throw new ForbiddenException("Device revoked or unknown");
    }
    return device;
  }

  private async withSkipPublish(
    user: TenantContext,
    fn: () => Promise<void>,
  ): Promise<void> {
    const current = getRequestTenant();
    await new Promise<void>((resolve, reject) => {
      requestTenantAls.run(
        {
          userId: current?.userId ?? user.userId,
          tenantId: current?.tenantId ?? user.tenantId,
          deviceId: current?.deviceId ?? user.deviceId,
          skipSyncPublish: true,
        },
        () => {
          fn().then(resolve, reject);
        },
      );
    });
  }

  private async hubDeviceId(tenantId: string): Promise<string | null> {
    const hub = await this.devices.findOne({
      where: { tenantId, fingerprint: HUB_FINGERPRINT },
    });
    return hub?.id ?? null;
  }

  private async serverSeq(tenantId: string): Promise<number> {
    const head = await this.changes
      .createQueryBuilder("c")
      .select("MAX(c.seq)", "max")
      .where("c.tenant_id = :tenantId", { tenantId })
      .getRawOne<{ max: string | null }>();
    return Number(head?.max ?? "0");
  }

  private async minRetainedSeq(tenantId: string): Promise<number> {
    const oldest = await this.changes
      .createQueryBuilder("c")
      .select("MIN(c.seq)", "min")
      .where("c.tenant_id = :tenantId", { tenantId })
      .getRawOne<{ min: string | null }>();
    return Number(oldest?.min ?? "0");
  }

  private async upsertCursor(
    tenantId: string,
    deviceId: string,
    stream: string,
    cursor: string,
  ): Promise<void> {
    const existing = await this.cursors.findOne({
      where: { tenantId, deviceId, stream },
    });
    if (existing) {
      existing.cursor = cursor;
      await this.cursors.save(existing);
      return;
    }
    await this.cursors.save(
      this.cursors.create({ tenantId, deviceId, stream, cursor }),
    );
  }

  private async touchDevice(
    deviceId: string,
    tenantId: string,
    error: string | null,
  ): Promise<void> {
    await this.devices.update(
      { id: deviceId, tenantId },
      { lastSyncAt: new Date(), lastSyncError: error },
    );
  }

  private toDto(row: SyncChange): SyncChangeDto {
    return {
      seq: String(row.seq),
      changeId: row.changeId,
      originDeviceId: row.originDeviceId,
      stream: row.stream as SyncStream,
      entityType: row.entityType as SyncEntityType,
      entityId: row.entityId,
      operation: row.operation as SyncChangeDto["operation"],
      entityVersion: row.entityVersion,
      payload: row.payload,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
