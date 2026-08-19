import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  InventoryOutDetail,
  InventoryOutItemRow,
  InventoryOutListItem,
  InventoryOutStatus,
  PaginatedInventoryOuts,
} from "@blackbox/shared";
import { DataSource, EntityManager, Repository } from "typeorm";
import { InjectRepository } from "@nestjs/typeorm";
import {
  InventoryMovement,
  InventoryOut,
  InventoryOutItem,
  InventoryStock,
  ProductSku,
  Warehouse,
} from "../../db/entities";
import { FixedTenantContext } from "../common/fixed-tenant.context";
import { CreateInventoryOutDto } from "./dto/inventory-out.dto";
import { ListInventoryOutQueryDto } from "./dto/list-inventory-out-query.dto";

function toNum(value: string | null | undefined): number {
  if (value == null || value === "") return 0;
  return Number(value);
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

@Injectable()
export class InventoryOutService {
  constructor(
    private readonly fixedTenant: FixedTenantContext,
    private readonly dataSource: DataSource,
    @InjectRepository(InventoryOut)
    private readonly outs: Repository<InventoryOut>,
    @InjectRepository(InventoryOutItem)
    private readonly outItems: Repository<InventoryOutItem>,
    @InjectRepository(Warehouse)
    private readonly warehouses: Repository<Warehouse>,
  ) {}

  async list(query: ListInventoryOutQueryDto): Promise<PaginatedInventoryOuts> {
    const tenantId = this.fixedTenant.tenantId;
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 25, 100);

    const qb = this.outs
      .createQueryBuilder("io")
      .where("io.tenant_id = :tenantId", { tenantId });

    if (query.warehouseId) {
      qb.andWhere("io.warehouse_id = :warehouseId", {
        warehouseId: query.warehouseId,
      });
    }
    if (query.dateFrom) {
      qb.andWhere("io.out_date >= :dateFrom", { dateFrom: query.dateFrom });
    }
    if (query.dateTo) {
      qb.andWhere("io.out_date <= :dateTo", { dateTo: query.dateTo });
    }
    if (query.search?.trim()) {
      const term = `%${query.search.trim().toLowerCase()}%`;
      qb.andWhere(
        `(LOWER(io.out_number) LIKE :term
          OR LOWER(COALESCE(io.reference, '')) LIKE :term)`,
        { term },
      );
    }

    const total = await qb.getCount();
    const rows = await qb
      .orderBy("io.out_date", "DESC")
      .addOrderBy("io.created_at", "DESC")
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getMany();

    const ids = rows.map((r) => r.id);
    const itemCounts = new Map<string, number>();
    if (ids.length > 0) {
      const counts = await this.outItems
        .createQueryBuilder("i")
        .select("i.inventory_out_id", "outId")
        .addSelect("COUNT(*)", "cnt")
        .where("i.tenant_id = :tenantId", { tenantId })
        .andWhere("i.inventory_out_id IN (:...ids)", { ids })
        .groupBy("i.inventory_out_id")
        .getRawMany<{ outId: string; cnt: string }>();
      for (const row of counts) itemCounts.set(row.outId, Number(row.cnt));
    }

    const warehouseNames = new Map<string, string>();
    const warehouseIds = [...new Set(rows.map((r) => r.warehouseId))];
    if (warehouseIds.length > 0) {
      const warehouses = await this.warehouses
        .createQueryBuilder("w")
        .where("w.id IN (:...warehouseIds)", { warehouseIds })
        .getMany();
      for (const w of warehouses) warehouseNames.set(w.id, w.name);
    }

    const items: InventoryOutListItem[] = rows.map((io) => ({
      id: io.id,
      outNumber: io.outNumber,
      warehouseId: io.warehouseId,
      warehouseName: warehouseNames.get(io.warehouseId) ?? "—",
      outDate:
        typeof io.outDate === "string"
          ? io.outDate.slice(0, 10)
          : String(io.outDate).slice(0, 10),
      reference: io.reference,
      status: io.status as InventoryOutStatus,
      total: toNum(io.total),
      itemCount: itemCounts.get(io.id) ?? 0,
    }));

    return { items, total, page, pageSize };
  }

  async create(dto: CreateInventoryOutDto): Promise<InventoryOutDetail> {
    const tenantId = this.fixedTenant.tenantId;

    if (!dto.items?.length) {
      throw new BadRequestException("At least one line item is required");
    }

    const seen = new Set<string>();
    for (const item of dto.items) {
      if (seen.has(item.productSkuId)) {
        throw new BadRequestException(
          "Duplicate SKU on inventory out; combine quantities into one line",
        );
      }
      seen.add(item.productSkuId);
    }

    return this.dataSource.transaction(async (manager) => {
      const warehouse = await manager.getRepository(Warehouse).findOne({
        where: { id: dto.warehouseId, tenantId, status: "active" },
      });
      if (!warehouse) {
        throw new BadRequestException("Warehouse not found or inactive");
      }

      const outNumber = await this.nextOutNumber(manager, tenantId);
      const outDate =
        dto.outDate?.trim() || new Date().toISOString().slice(0, 10);
      const notes = dto.notes?.trim() ?? "";
      const reference = dto.reference?.trim() || null;
      const reasonParts = [
        `Out ${outNumber}`,
        reference ? `ref ${reference}` : null,
        notes || null,
      ].filter(Boolean);
      const reason = reasonParts.join(" — ");

      type BuiltLine = {
        productSkuId: string;
        quantity: number;
        unitCost: number;
        lineTotal: number;
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

        const productSku = await manager.getRepository(ProductSku).findOne({
          where: { id: item.productSkuId, tenantId, status: "active" },
        });
        if (!productSku) {
          throw new BadRequestException(
            `Product SKU ${item.productSkuId} not found or inactive`,
          );
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

        const available = toNum(stock.quantityAvailable);
        if (qty > available) {
          throw new BadRequestException(
            `Insufficient stock for ${productSku.sku}: requested ${qty}, available ${available}`,
          );
        }

        const unitCost = toNum(productSku.costPrice);
        const lineTotal = round4(qty * unitCost);
        subtotal = round4(subtotal + lineTotal);
        builtLines.push({
          productSkuId: item.productSkuId,
          quantity: qty,
          unitCost,
          lineTotal,
          skuCode: productSku.sku,
          stock,
        });
      }

      const total = subtotal;

      const header = await manager.getRepository(InventoryOut).save(
        manager.getRepository(InventoryOut).create({
          tenantId,
          outNumber,
          warehouseId: warehouse.id,
          outDate,
          reference,
          notes,
          status: "POSTED",
          subtotal: String(subtotal),
          total: String(total),
        }),
      );

      const stockRepo = manager.getRepository(InventoryStock);
      for (const line of builtLines) {
        await manager.getRepository(InventoryOutItem).save(
          manager.getRepository(InventoryOutItem).create({
            tenantId,
            inventoryOutId: header.id,
            productSkuId: line.productSkuId,
            quantity: String(line.quantity),
            unitCost: String(line.unitCost),
          }),
        );

        await manager.getRepository(InventoryMovement).save(
          manager.getRepository(InventoryMovement).create({
            tenantId,
            productSkuId: line.productSkuId,
            warehouseId: warehouse.id,
            movementType: "INVENTORY_OUT",
            quantity: String(line.quantity),
            referenceType: "inventory_out",
            referenceId: header.id,
            reason,
          }),
        );

        const onHand = round4(
          toNum(line.stock.quantityOnHand) - line.quantity,
        );
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

  async getById(id: string): Promise<InventoryOutDetail> {
    return this.getByIdInManager(this.dataSource.manager, id);
  }

  private async getByIdInManager(
    manager: EntityManager,
    id: string,
  ): Promise<InventoryOutDetail> {
    const tenantId = this.fixedTenant.tenantId;
    const header = await manager.getRepository(InventoryOut).findOne({
      where: { id, tenantId },
      relations: { warehouse: true },
    });
    if (!header) throw new NotFoundException("Inventory out not found");

    const lines = await manager.getRepository(InventoryOutItem).find({
      where: { inventoryOutId: id, tenantId },
      relations: { productSku: { product: true } },
      order: { createdAt: "ASC" },
    });

    const items: InventoryOutItemRow[] = lines.map((l) => {
      const quantity = toNum(l.quantity);
      const unitCost = toNum(l.unitCost);
      return {
        id: l.id,
        productSkuId: l.productSkuId,
        productName: l.productSku?.product?.name ?? "—",
        variantName: l.productSku?.variantName ?? "",
        sku: l.productSku?.sku ?? "—",
        barcode: l.productSku?.barcode ?? null,
        quantity,
        unitCost,
        lineTotal: round4(quantity * unitCost),
      };
    });

    return {
      id: header.id,
      outNumber: header.outNumber,
      warehouseId: header.warehouseId,
      warehouseName: header.warehouse?.name ?? "—",
      outDate:
        typeof header.outDate === "string"
          ? header.outDate.slice(0, 10)
          : String(header.outDate).slice(0, 10),
      reference: header.reference,
      notes: header.notes,
      status: header.status as InventoryOutStatus,
      subtotal: toNum(header.subtotal),
      total: toNum(header.total),
      items,
      createdAt: header.createdAt.toISOString(),
      updatedAt: header.updatedAt.toISOString(),
    };
  }

  private async nextOutNumber(
    manager: EntityManager,
    tenantId: string,
  ): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `IO-${year}-`;
    const latest = await manager
      .getRepository(InventoryOut)
      .createQueryBuilder("io")
      .where("io.tenant_id = :tenantId", { tenantId })
      .andWhere("io.out_number LIKE :prefix", { prefix: `${prefix}%` })
      .orderBy("io.out_number", "DESC")
      .setLock("pessimistic_write")
      .getOne();

    let seq = 1;
    if (latest?.outNumber) {
      const part = latest.outNumber.slice(prefix.length);
      const n = Number(part);
      if (!Number.isNaN(n)) seq = n + 1;
    }
    return `${prefix}${String(seq).padStart(6, "0")}`;
  }
}
