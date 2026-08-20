import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type {
  InventoryInOutReport,
  InventoryMovementListItem,
  InventoryMovementType,
  PaginatedInventoryMovements,
} from "@blackbox/shared";
import { Repository } from "typeorm";
import { InventoryMovement } from "../../db/entities";
import { FixedTenantContext } from "../common/fixed-tenant.context";
import { ListInventoryMovementsQueryDto } from "./dto/list-inventory-movements-query.dto";

function toNum(value: string | null | undefined): number {
  if (value == null || value === "") return 0;
  return Number(value);
}

function eachInclusiveDate(dateFrom: string, dateTo: string): string[] {
  const days: string[] = [];
  const cur = new Date(`${dateFrom}T00:00:00.000Z`);
  const last = new Date(`${dateTo}T00:00:00.000Z`);
  if (Number.isNaN(cur.getTime()) || Number.isNaN(last.getTime()) || cur > last) {
    return days;
  }
  while (cur <= last) {
    days.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return days;
}

@Injectable()
export class InventoryMovementsService {
  constructor(
    private readonly fixedTenant: FixedTenantContext,
    @InjectRepository(InventoryMovement)
    private readonly movements: Repository<InventoryMovement>,
  ) {}

  async list(
    query: ListInventoryMovementsQueryDto,
  ): Promise<PaginatedInventoryMovements> {
    const tenantId = this.fixedTenant.tenantId;
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 100, 500);

    const qb = this.movements
      .createQueryBuilder("m")
      .innerJoinAndSelect("m.productSku", "s")
      .innerJoinAndSelect("m.warehouse", "w")
      .where("m.tenant_id = :tenantId", { tenantId });

    if (query.productSkuId) {
      qb.andWhere("m.product_sku_id = :productSkuId", {
        productSkuId: query.productSkuId,
      });
    }
    if (query.warehouseId) {
      qb.andWhere("m.warehouse_id = :warehouseId", {
        warehouseId: query.warehouseId,
      });
    }
    if (query.since) {
      qb.andWhere("m.created_at >= :since", { since: query.since });
    }

    const total = await qb.getCount();
    const rows = await qb
      .orderBy("m.created_at", "DESC")
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getMany();

    return {
      items: rows.map((m) => this.toListItem(m)),
      total,
      page,
      pageSize,
    };
  }

  async inOutReport(dateFrom: string, dateTo: string): Promise<InventoryInOutReport> {
    if (dateFrom > dateTo) {
      throw new BadRequestException("dateFrom must be on or before dateTo");
    }

    const tenantId = this.fixedTenant.tenantId;
    const from = new Date(`${dateFrom}T00:00:00.000Z`);
    const toExclusive = new Date(`${dateTo}T00:00:00.000Z`);
    toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);

    const rows = await this.movements
      .createQueryBuilder("m")
      .innerJoinAndSelect("m.productSku", "s")
      .innerJoinAndSelect("m.warehouse", "w")
      .where("m.tenant_id = :tenantId", { tenantId })
      .andWhere("m.movement_type IN (:...types)", {
        types: ["PURCHASE_RECEIPT", "INVENTORY_OUT"],
      })
      .andWhere("m.created_at >= :from", { from })
      .andWhere("m.created_at < :toExclusive", { toExclusive })
      .orderBy("m.created_at", "DESC")
      .getMany();

    const inboundItems: InventoryMovementListItem[] = [];
    const outboundItems: InventoryMovementListItem[] = [];
    const qtyByDay = new Map<string, { inboundQty: number; outboundQty: number }>();

    for (const m of rows) {
      const item = this.toListItem(m);
      const day = m.createdAt.toISOString().slice(0, 10);
      const bucket = qtyByDay.get(day) ?? { inboundQty: 0, outboundQty: 0 };
      if (m.movementType === "PURCHASE_RECEIPT") {
        inboundItems.push(item);
        bucket.inboundQty += item.quantity;
      } else if (m.movementType === "INVENTORY_OUT") {
        outboundItems.push(item);
        bucket.outboundQty += item.quantity;
      }
      qtyByDay.set(day, bucket);
    }

    const inboundQty = inboundItems.reduce((sum, i) => sum + i.quantity, 0);
    const outboundQty = outboundItems.reduce((sum, i) => sum + i.quantity, 0);

    return {
      dateFrom,
      dateTo,
      inbound: {
        items: inboundItems,
        quantityTotal: inboundQty,
        lineCount: inboundItems.length,
      },
      outbound: {
        items: outboundItems,
        quantityTotal: outboundQty,
        lineCount: outboundItems.length,
      },
      byDay: eachInclusiveDate(dateFrom, dateTo).map((date) => {
        const bucket = qtyByDay.get(date);
        return {
          date,
          inboundQty: bucket?.inboundQty ?? 0,
          outboundQty: bucket?.outboundQty ?? 0,
        };
      }),
    };
  }

  private toListItem(m: InventoryMovement): InventoryMovementListItem {
    return {
      id: m.id,
      productSkuId: m.productSkuId,
      sku: m.productSku.sku,
      variantName: m.productSku.variantName,
      warehouseId: m.warehouseId,
      warehouseName: m.warehouse.name,
      movementType: m.movementType as InventoryMovementType,
      quantity: toNum(m.quantity),
      referenceType: m.referenceType,
      referenceId: m.referenceId,
      reason: m.reason,
      createdAt: m.createdAt.toISOString(),
    };
  }
}
