import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  PaginatedVendorReturns,
  PendingVendorReturnLine,
  VendorReturnDetail,
  VendorReturnItemRow,
  VendorReturnListItem,
  VendorReturnReason,
  VendorReturnSettlement,
  VendorReturnStatus,
} from "@blackbox/shared";
import { DataSource, EntityManager, IsNull, Repository } from "typeorm";
import { InjectRepository } from "@nestjs/typeorm";
import {
  GoodsReceiptItem,
  InventoryMovement,
  InventoryStock,
  ProductSku,
  PurchaseOrder,
  PurchaseOrderItem,
  Vendor,
  VendorReturn,
  VendorReturnItem,
  VendorSku,
  Warehouse,
} from "../../db/entities";
import { FixedTenantContext } from "../common/fixed-tenant.context";
import {
  CreateVendorReturnDto,
  ListVendorReturnsQueryDto,
} from "./dto/vendor-return.dto";

function toNum(value: string | null | undefined): number {
  if (value == null || value === "") return 0;
  return Number(value);
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

@Injectable()
export class VendorReturnsService {
  constructor(
    private readonly fixedTenant: FixedTenantContext,
    private readonly dataSource: DataSource,
    @InjectRepository(VendorReturn)
    private readonly returns: Repository<VendorReturn>,
    @InjectRepository(VendorReturnItem)
    private readonly returnItems: Repository<VendorReturnItem>,
  ) {}

  async list(
    query: ListVendorReturnsQueryDto,
  ): Promise<PaginatedVendorReturns> {
    const tenantId = this.fixedTenant.tenantId;
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 25, 100);

    const qb = this.returns
      .createQueryBuilder("vr")
      .leftJoin("vr.vendor", "vendor")
      .where("vr.tenant_id = :tenantId", { tenantId });

    if (query.vendorId) {
      qb.andWhere("vr.vendor_id = :vendorId", { vendorId: query.vendorId });
    }
    if (query.warehouseId) {
      qb.andWhere("vr.warehouse_id = :warehouseId", {
        warehouseId: query.warehouseId,
      });
    }
    if (query.status) {
      qb.andWhere("vr.status = :status", { status: query.status });
    }
    if (query.dateFrom) {
      qb.andWhere("vr.return_date >= :dateFrom", { dateFrom: query.dateFrom });
    }
    if (query.dateTo) {
      qb.andWhere("vr.return_date <= :dateTo", { dateTo: query.dateTo });
    }
    if (query.search?.trim()) {
      const term = `%${query.search.trim().toLowerCase()}%`;
      qb.andWhere(
        `(LOWER(vr.return_number) LIKE :term
          OR LOWER(COALESCE(vendor.name, '')) LIKE :term)`,
        { term },
      );
    }

    const total = await qb.getCount();
    const rows = await qb
      .orderBy("vr.return_date", "DESC")
      .addOrderBy("vr.created_at", "DESC")
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getMany();

    const ids = rows.map((r) => r.id);
    const countById = new Map<string, number>();
    if (ids.length > 0) {
      const counts = await this.returnItems
        .createQueryBuilder("i")
        .select("i.vendor_return_id", "returnId")
        .addSelect("COUNT(*)", "n")
        .where("i.tenant_id = :tenantId", { tenantId })
        .andWhere("i.vendor_return_id IN (:...ids)", { ids })
        .groupBy("i.vendor_return_id")
        .getRawMany<{ returnId: string; n: string }>();
      for (const c of counts) countById.set(c.returnId, Number(c.n));
    }

    const vendorIds = [...new Set(rows.map((r) => r.vendorId))];
    const warehouseIds = [...new Set(rows.map((r) => r.warehouseId))];
    const vendors =
      vendorIds.length > 0
        ? await this.dataSource.getRepository(Vendor).findBy(
            vendorIds.map((id) => ({ id, tenantId })),
          )
        : [];
    const warehouses =
      warehouseIds.length > 0
        ? await this.dataSource.getRepository(Warehouse).findBy(
            warehouseIds.map((id) => ({ id, tenantId })),
          )
        : [];
    const vendorName = new Map(vendors.map((v) => [v.id, v.name]));
    const warehouseName = new Map(warehouses.map((w) => [w.id, w.name]));

    const items: VendorReturnListItem[] = rows.map((vr) => ({
      id: vr.id,
      returnNumber: vr.returnNumber,
      vendorId: vr.vendorId,
      vendorName: vendorName.get(vr.vendorId) ?? "—",
      warehouseId: vr.warehouseId,
      warehouseName: warehouseName.get(vr.warehouseId) ?? "—",
      returnDate:
        typeof vr.returnDate === "string"
          ? vr.returnDate.slice(0, 10)
          : String(vr.returnDate).slice(0, 10),
      status: vr.status as VendorReturnStatus,
      total: toNum(vr.total),
      itemCount: countById.get(vr.id) ?? 0,
    }));

    return { items, total, page, pageSize };
  }

  async create(dto: CreateVendorReturnDto): Promise<VendorReturnDetail> {
    const tenantId = this.fixedTenant.tenantId;
    if (!dto.items?.length) {
      throw new BadRequestException("At least one line item is required");
    }

    const seen = new Set<string>();
    for (const item of dto.items) {
      if (seen.has(item.productSkuId)) {
        throw new BadRequestException(
          "Duplicate SKU on vendor return; combine quantities into one line",
        );
      }
      seen.add(item.productSkuId);
    }

    return this.dataSource.transaction(async (manager) => {
      const vendor = await manager.getRepository(Vendor).findOne({
        where: { id: dto.vendorId, tenantId, status: "active" },
      });
      if (!vendor) {
        throw new BadRequestException("Vendor not found or inactive");
      }
      const warehouse = await manager.getRepository(Warehouse).findOne({
        where: { id: dto.warehouseId, tenantId, status: "active" },
      });
      if (!warehouse) {
        throw new BadRequestException("Warehouse not found or inactive");
      }

      const returnNumber = await this.nextReturnNumber(manager, tenantId);
      const returnDate =
        dto.returnDate?.trim() || new Date().toISOString().slice(0, 10);
      const notes = dto.notes?.trim() ?? "";
      const reason = `Return ${returnNumber}`;

      type BuiltLine = {
        productSkuId: string;
        vendorSkuId: string | null;
        purchaseUnitId: string | null;
        unitsPerPurchaseUnit: number;
        quantity: number;
        unitCost: number;
        lineTotal: number;
        reason: VendorReturnReason;
        skuCode: string;
        stock: InventoryStock;
      };

      const builtLines: BuiltLine[] = [];
      let subtotal = 0;

      for (const item of dto.items) {
        const qty = round4(Number(item.quantity));
        if (!(qty > 0)) {
          throw new BadRequestException("Quantity must be greater than zero");
        }
        if (item.unitCost < 0) {
          throw new BadRequestException("Unit cost must be >= 0");
        }

        const productSku = await manager.getRepository(ProductSku).findOne({
          where: { id: item.productSkuId, tenantId, status: "active" },
        });
        if (!productSku) {
          throw new BadRequestException(
            `Product SKU ${item.productSkuId} not found or inactive`,
          );
        }

        let vendorSku: VendorSku | null = null;
        if (item.vendorSkuId) {
          vendorSku = await manager.getRepository(VendorSku).findOne({
            where: {
              id: item.vendorSkuId,
              tenantId,
              vendorId: vendor.id,
              productSkuId: item.productSkuId,
            },
          });
          if (!vendorSku) {
            throw new BadRequestException("Vendor SKU not found for this vendor");
          }
        } else {
          vendorSku = await manager.getRepository(VendorSku).findOne({
            where: {
              tenantId,
              vendorId: vendor.id,
              productSkuId: item.productSkuId,
              status: "active",
            },
          });
        }

        const stockRepo = manager.getRepository(InventoryStock);
        const stock = await stockRepo.findOne({
          where: {
            tenantId,
            productSkuId: item.productSkuId,
            warehouseId: warehouse.id,
          },
          lock: { mode: "pessimistic_write" },
        });
        if (!stock) {
          throw new BadRequestException(
            `No stock for SKU ${productSku.sku} in warehouse ${warehouse.name}`,
          );
        }
        const unitsPer = toNum(vendorSku?.unitsPerPurchaseUnit) || 1;
        const stockDelta = round4(qty * unitsPer);
        const available = toNum(stock.quantityAvailable);
        if (stockDelta > available) {
          throw new BadRequestException(
            `Insufficient stock for ${productSku.sku}: requested ${stockDelta}, available ${available}`,
          );
        }

        const unitCost = round4(item.unitCost);
        const lineTotal = round4(qty * unitCost);
        subtotal = round4(subtotal + lineTotal);
        builtLines.push({
          productSkuId: item.productSkuId,
          vendorSkuId: vendorSku?.id ?? null,
          purchaseUnitId: vendorSku?.purchaseUnitId ?? null,
          unitsPerPurchaseUnit: unitsPer,
          quantity: qty,
          unitCost,
          lineTotal,
          reason: item.reason,
          skuCode: productSku.sku,
          stock,
        });
      }

      const header = await manager.getRepository(VendorReturn).save(
        manager.getRepository(VendorReturn).create({
          tenantId,
          returnNumber,
          vendorId: vendor.id,
          warehouseId: warehouse.id,
          returnDate,
          notes,
          status: "OPEN",
          subtotal: String(subtotal),
          total: String(subtotal),
        }),
      );

      const stockRepo = manager.getRepository(InventoryStock);
      for (const line of builtLines) {
        await manager.getRepository(VendorReturnItem).save(
          manager.getRepository(VendorReturnItem).create({
            tenantId,
            vendorReturnId: header.id,
            productSkuId: line.productSkuId,
            vendorSkuId: line.vendorSkuId,
            purchaseUnitId: line.purchaseUnitId,
            unitsPerPurchaseUnit: String(line.unitsPerPurchaseUnit),
            quantity: String(line.quantity),
            unitCost: String(line.unitCost),
            reason: line.reason,
          }),
        );

        const stockDelta = round4(line.quantity * line.unitsPerPurchaseUnit);
        await manager.getRepository(InventoryMovement).save(
          manager.getRepository(InventoryMovement).create({
            tenantId,
            productSkuId: line.productSkuId,
            warehouseId: warehouse.id,
            movementType: "RETURN",
            quantity: String(stockDelta),
            referenceType: "vendor_return",
            referenceId: header.id,
            reason,
          }),
        );

        const onHand = round4(toNum(line.stock.quantityOnHand) - stockDelta);
        const reserved = toNum(line.stock.quantityReserved);
        if (onHand < 0) {
          throw new BadRequestException(
            `Insufficient on-hand for ${line.skuCode}`,
          );
        }
        line.stock.quantityOnHand = String(onHand);
        line.stock.quantityAvailable = String(round4(onHand - reserved));
        await stockRepo.save(line.stock);
      }

      return this.getByIdInManager(manager, header.id);
    });
  }

  async getById(id: string): Promise<VendorReturnDetail> {
    return this.getByIdInManager(this.dataSource.manager, id);
  }

  async listPending(vendorId: string): Promise<PendingVendorReturnLine[]> {
    const tenantId = this.fixedTenant.tenantId;
    const lines = await this.returnItems.find({
      where: { tenantId, settlement: IsNull() },
      relations: {
        vendorReturn: { vendor: true },
        productSku: { product: true },
        purchaseUnit: true,
      },
      order: { createdAt: "ASC" },
    });
    return lines
      .filter((l) => l.vendorReturn?.vendorId === vendorId)
      .map((l) => {
        const quantity = toNum(l.quantity);
        const unitCost = toNum(l.unitCost);
        return {
          vendorReturnItemId: l.id,
          vendorReturnId: l.vendorReturnId,
          returnNumber: l.vendorReturn?.returnNumber ?? "—",
          productSkuId: l.productSkuId,
          vendorSkuId: l.vendorSkuId,
          productName: l.productSku?.product?.name ?? "—",
          variantName: l.productSku?.variantName ?? "",
          sku: l.productSku?.sku ?? "—",
          reason: l.reason as VendorReturnReason,
          quantity,
          unitCost,
          lineTotal: round4(quantity * unitCost),
          purchaseUnitName: l.purchaseUnit?.name ?? null,
          unitsPerPurchaseUnit: toNum(l.unitsPerPurchaseUnit) || 1,
        };
      });
  }

  async lastPurchaseCost(
    vendorId: string,
    productSkuId: string,
  ): Promise<{ unitCost: number }> {
    const tenantId = this.fixedTenant.tenantId;

    const fromReceipt = await this.dataSource
      .getRepository(GoodsReceiptItem)
      .createQueryBuilder("i")
      .innerJoin("i.goodsReceipt", "gr")
      .where("i.tenant_id = :tenantId", { tenantId })
      .andWhere("i.product_sku_id = :productSkuId", { productSkuId })
      .andWhere("gr.vendor_id = :vendorId", { vendorId })
      .andWhere("gr.status = :status", { status: "POSTED" })
      .orderBy("gr.received_at", "DESC")
      .addOrderBy("i.created_at", "DESC")
      .getOne();
    if (fromReceipt) {
      return { unitCost: toNum(fromReceipt.receivingUnitCost) };
    }

    const fromPo = await this.dataSource
      .getRepository(PurchaseOrderItem)
      .createQueryBuilder("i")
      .innerJoin(PurchaseOrder, "po", "po.id = i.purchase_order_id")
      .where("i.tenant_id = :tenantId", { tenantId })
      .andWhere("i.product_sku_id = :productSkuId", { productSkuId })
      .andWhere("po.vendor_id = :vendorId", { vendorId })
      .orderBy("po.updated_at", "DESC")
      .getOne();
    if (fromPo) {
      return { unitCost: toNum(fromPo.unitCost) };
    }

    const vendorSku = await this.dataSource.getRepository(VendorSku).findOne({
      where: { tenantId, vendorId, productSkuId, status: "active" },
    });
    return { unitCost: toNum(vendorSku?.purchasePrice) };
  }

  private async getByIdInManager(
    manager: EntityManager,
    id: string,
  ): Promise<VendorReturnDetail> {
    const tenantId = this.fixedTenant.tenantId;
    const header = await manager.getRepository(VendorReturn).findOne({
      where: { id, tenantId },
      relations: { vendor: true, warehouse: true },
    });
    if (!header) throw new NotFoundException("Vendor return not found");

    const lines = await manager.getRepository(VendorReturnItem).find({
      where: { vendorReturnId: id, tenantId },
      relations: { productSku: { product: true }, purchaseUnit: true },
      order: { createdAt: "ASC" },
    });

    const items: VendorReturnItemRow[] = lines.map((l) => {
      const quantity = toNum(l.quantity);
      const unitCost = toNum(l.unitCost);
      return {
        id: l.id,
        productSkuId: l.productSkuId,
        vendorSkuId: l.vendorSkuId,
        productName: l.productSku?.product?.name ?? "—",
        variantName: l.productSku?.variantName ?? "",
        sku: l.productSku?.sku ?? "—",
        barcode: l.productSku?.barcode ?? null,
        purchaseUnitId: l.purchaseUnitId,
        purchaseUnitName: l.purchaseUnit?.name ?? null,
        unitsPerPurchaseUnit: toNum(l.unitsPerPurchaseUnit) || 1,
        quantity,
        unitCost,
        lineTotal: round4(quantity * unitCost),
        reason: l.reason as VendorReturnReason,
        settlement: (l.settlement as VendorReturnSettlement | null) ?? null,
        goodsReceiptId: l.goodsReceiptId,
      };
    });

    return {
      id: header.id,
      returnNumber: header.returnNumber,
      vendorId: header.vendorId,
      vendorName: header.vendor?.name ?? "—",
      warehouseId: header.warehouseId,
      warehouseName: header.warehouse?.name ?? "—",
      returnDate:
        typeof header.returnDate === "string"
          ? header.returnDate.slice(0, 10)
          : String(header.returnDate).slice(0, 10),
      notes: header.notes,
      status: header.status as VendorReturnStatus,
      subtotal: toNum(header.subtotal),
      total: toNum(header.total),
      items,
      createdAt: header.createdAt.toISOString(),
      updatedAt: header.updatedAt.toISOString(),
    };
  }

  private async nextReturnNumber(
    manager: EntityManager,
    tenantId: string,
  ): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `VR-${year}-`;
    const latest = await manager
      .getRepository(VendorReturn)
      .createQueryBuilder("vr")
      .where("vr.tenant_id = :tenantId", { tenantId })
      .andWhere("vr.return_number LIKE :prefix", { prefix: `${prefix}%` })
      .orderBy("vr.return_number", "DESC")
      .setLock("pessimistic_write")
      .getOne();

    let seq = 1;
    if (latest?.returnNumber) {
      const part = latest.returnNumber.slice(prefix.length);
      const n = Number(part);
      if (!Number.isNaN(n)) seq = n + 1;
    }
    return `${prefix}${String(seq).padStart(6, "0")}`;
  }
}
