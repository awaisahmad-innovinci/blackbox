import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  InventoryOutReturnDetail,
  InventoryOutReturnItemRow,
  InventoryOutReturnListItem,
  InventoryOutReturnStatus,
  PaginatedInventoryOutReturns,
} from "@blackbox/shared";
import { DataSource, EntityManager, Repository } from "typeorm";
import { InjectRepository } from "@nestjs/typeorm";
import {
  InventoryMovement,
  InventoryOutItem,
  InventoryOutReturn,
  InventoryOutReturnItem,
  InventoryStock,
  ProductSku,
  Warehouse,
} from "../../db/entities";
import { FixedTenantContext } from "../common/fixed-tenant.context";
import {
  applyInventoryOutBalanceDelta,
  getInventoryOutBalanceQty,
} from "../inventory-out/inventory-out-balance";
import {
  CreateInventoryOutReturnDto,
  ListInventoryOutReturnsQueryDto,
} from "./dto/inventory-out-return.dto";

function toNum(value: string | null | undefined): number {
  if (value == null || value === "") return 0;
  return Number(value);
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

@Injectable()
export class InventoryOutReturnsService {
  constructor(
    private readonly fixedTenant: FixedTenantContext,
    private readonly dataSource: DataSource,
    @InjectRepository(InventoryOutReturn)
    private readonly returns: Repository<InventoryOutReturn>,
    @InjectRepository(InventoryOutReturnItem)
    private readonly returnItems: Repository<InventoryOutReturnItem>,
  ) {}

  async list(
    query: ListInventoryOutReturnsQueryDto,
  ): Promise<PaginatedInventoryOutReturns> {
    const tenantId = this.fixedTenant.tenantId;
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 25, 100);

    const qb = this.returns
      .createQueryBuilder("r")
      .where("r.tenant_id = :tenantId", { tenantId });

    if (query.warehouseId) {
      qb.andWhere("r.warehouse_id = :warehouseId", {
        warehouseId: query.warehouseId,
      });
    }
    if (query.dateFrom) {
      qb.andWhere("r.return_date >= :dateFrom", { dateFrom: query.dateFrom });
    }
    if (query.dateTo) {
      qb.andWhere("r.return_date <= :dateTo", { dateTo: query.dateTo });
    }
    if (query.search?.trim()) {
      const term = `%${query.search.trim().toLowerCase()}%`;
      qb.andWhere(`LOWER(r.return_number) LIKE :term`, { term });
    }

    const total = await qb.getCount();
    const rows = await qb
      .orderBy("r.return_date", "DESC")
      .addOrderBy("r.created_at", "DESC")
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getMany();

    const ids = rows.map((r) => r.id);
    const countById = new Map<string, number>();
    if (ids.length > 0) {
      const counts = await this.returnItems
        .createQueryBuilder("i")
        .select("i.inventory_out_return_id", "returnId")
        .addSelect("COUNT(*)", "n")
        .where("i.tenant_id = :tenantId", { tenantId })
        .andWhere("i.inventory_out_return_id IN (:...ids)", { ids })
        .groupBy("i.inventory_out_return_id")
        .getRawMany<{ returnId: string; n: string }>();
      for (const c of counts) countById.set(c.returnId, Number(c.n));
    }

    const warehouseIds = [...new Set(rows.map((r) => r.warehouseId))];
    const warehouseNames = new Map<string, string>();
    if (warehouseIds.length > 0) {
      const warehouses = await this.dataSource
        .getRepository(Warehouse)
        .createQueryBuilder("w")
        .where("w.id IN (:...warehouseIds)", { warehouseIds })
        .getMany();
      for (const w of warehouses) warehouseNames.set(w.id, w.name);
    }

    const items: InventoryOutReturnListItem[] = rows.map((r) => ({
      id: r.id,
      returnNumber: r.returnNumber,
      warehouseId: r.warehouseId,
      warehouseName: warehouseNames.get(r.warehouseId) ?? "—",
      returnDate:
        typeof r.returnDate === "string"
          ? r.returnDate.slice(0, 10)
          : String(r.returnDate).slice(0, 10),
      status: r.status as InventoryOutReturnStatus,
      total: toNum(r.total),
      itemCount: countById.get(r.id) ?? 0,
    }));

    return { items, total, page, pageSize };
  }

  async create(dto: CreateInventoryOutReturnDto): Promise<InventoryOutReturnDetail> {
    const tenantId = this.fixedTenant.tenantId;

    if (!dto.items?.length) {
      throw new BadRequestException("At least one line item is required");
    }

    const seen = new Set<string>();
    for (const item of dto.items) {
      if (seen.has(item.productSkuId)) {
        throw new BadRequestException(
          "Duplicate SKU on return; combine quantities into one line",
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

      const returnNumber = await this.nextReturnNumber(manager, tenantId);
      const returnDate =
        dto.returnDate?.trim() || new Date().toISOString().slice(0, 10);
      const notes = dto.notes?.trim() ?? "";
      const reason = `Inventory out return ${returnNumber}`;

      type BuiltLine = {
        productSkuId: string;
        quantity: number;
        unitCost: number;
        lineTotal: number;
        skuCode: string;
        balanceItemId: string | null;
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

        const balance = await manager.getRepository(InventoryOutItem).findOne({
          where: {
            tenantId,
            warehouseId: warehouse.id,
            productSkuId: item.productSkuId,
          },
          lock: { mode: "pessimistic_write" },
        });
        const balanceQty = balance ? toNum(balance.quantity) : 0;
        if (qty > balanceQty) {
          throw new BadRequestException(
            `Return exceeds out balance for ${productSku.sku}: requested ${qty}, available ${balanceQty}`,
          );
        }

        const stockRepo = manager.getRepository(InventoryStock);
        let stock = await stockRepo.findOne({
          where: {
            tenantId,
            productSkuId: item.productSkuId,
            warehouseId: warehouse.id,
          },
          lock: { mode: "pessimistic_write" },
        });
        if (!stock) {
          stock = stockRepo.create({
            tenantId,
            productSkuId: item.productSkuId,
            warehouseId: warehouse.id,
            quantityOnHand: "0",
            quantityReserved: "0",
            quantityAvailable: "0",
          });
        }

        const unitCost = balance
          ? toNum(balance.unitCost)
          : toNum(productSku.costPrice);
        const lineTotal = round4(qty * unitCost);
        subtotal = round4(subtotal + lineTotal);
        builtLines.push({
          productSkuId: item.productSkuId,
          quantity: qty,
          unitCost,
          lineTotal,
          skuCode: productSku.sku,
          balanceItemId: balance?.id ?? null,
          stock,
        });
      }

      const header = await manager.getRepository(InventoryOutReturn).save(
        manager.getRepository(InventoryOutReturn).create({
          tenantId,
          returnNumber,
          warehouseId: warehouse.id,
          returnDate,
          notes,
          status: "POSTED",
          subtotal: String(subtotal),
          total: String(subtotal),
        }),
      );

      const stockRepo = manager.getRepository(InventoryStock);
      for (const line of builtLines) {
        await applyInventoryOutBalanceDelta(
          manager,
          tenantId,
          warehouse.id,
          line.productSkuId,
          -line.quantity,
          line.unitCost,
        );

        await manager.getRepository(InventoryOutReturnItem).save(
          manager.getRepository(InventoryOutReturnItem).create({
            tenantId,
            inventoryOutReturnId: header.id,
            productSkuId: line.productSkuId,
            inventoryOutItemId: line.balanceItemId,
            quantity: String(line.quantity),
            unitCost: String(line.unitCost),
          }),
        );

        await manager.getRepository(InventoryMovement).save(
          manager.getRepository(InventoryMovement).create({
            tenantId,
            productSkuId: line.productSkuId,
            warehouseId: warehouse.id,
            movementType: "INVENTORY_OUT_RETURN",
            quantity: String(line.quantity),
            referenceType: "inventory_out_return",
            referenceId: header.id,
            reason,
          }),
        );

        const onHand = round4(toNum(line.stock.quantityOnHand) + line.quantity);
        const reserved = toNum(line.stock.quantityReserved);
        line.stock.quantityOnHand = String(onHand);
        line.stock.quantityAvailable = String(round4(onHand - reserved));
        await stockRepo.save(line.stock);
      }

      return this.getByIdInManager(manager, header.id);
    });
  }

  async returnableQuantity(
    warehouseId: string,
    productSkuId: string,
  ): Promise<{ quantityAvailable: number }> {
    const tenantId = this.fixedTenant.tenantId;
    const qty = await getInventoryOutBalanceQty(
      this.dataSource.manager,
      tenantId,
      warehouseId,
      productSkuId,
    );
    return { quantityAvailable: qty };
  }

  async getById(id: string): Promise<InventoryOutReturnDetail> {
    return this.getByIdInManager(this.dataSource.manager, id);
  }

  private async getByIdInManager(
    manager: EntityManager,
    id: string,
  ): Promise<InventoryOutReturnDetail> {
    const tenantId = this.fixedTenant.tenantId;
    const header = await manager.getRepository(InventoryOutReturn).findOne({
      where: { id, tenantId },
      relations: { warehouse: true },
    });
    if (!header) throw new NotFoundException("Inventory out return not found");

    const lines = await manager.getRepository(InventoryOutReturnItem).find({
      where: { inventoryOutReturnId: id, tenantId },
      relations: { productSku: { product: true } },
      order: { createdAt: "ASC" },
    });

    const items: InventoryOutReturnItemRow[] = lines.map((l) => {
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
        inventoryOutItemId: l.inventoryOutItemId,
      };
    });

    return {
      id: header.id,
      returnNumber: header.returnNumber,
      warehouseId: header.warehouseId,
      warehouseName: header.warehouse?.name ?? "—",
      returnDate:
        typeof header.returnDate === "string"
          ? header.returnDate.slice(0, 10)
          : String(header.returnDate).slice(0, 10),
      notes: header.notes,
      status: header.status as InventoryOutReturnStatus,
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
    const prefix = `IOR-${year}-`;
    const latest = await manager
      .getRepository(InventoryOutReturn)
      .createQueryBuilder("r")
      .where("r.tenant_id = :tenantId", { tenantId })
      .andWhere("r.return_number LIKE :prefix", { prefix: `${prefix}%` })
      .orderBy("r.return_number", "DESC")
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
