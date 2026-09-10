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
      .innerJoin("product_skus", "s", "s.id = m.product_sku_id")
      .innerJoin("products", "p", "p.id = s.product_id")
      .innerJoin("warehouses", "w", "w.id = m.warehouse_id")
      .leftJoin(
        "goods_receipts",
        "gr",
        "m.reference_type = 'goods_receipt' AND m.reference_id = gr.id",
      )
      .leftJoin("vendors", "v", "v.id = gr.vendor_id")
      .select([
        "m.id AS id",
        "m.product_sku_id AS productSkuId",
        "s.sku AS sku",
        "s.variant_name AS variantName",
        "p.id AS productId",
        "p.name AS productName",
        "m.warehouse_id AS warehouseId",
        "w.name AS warehouseName",
        "m.movement_type AS movementType",
        "m.quantity AS quantity",
        "m.reference_type AS referenceType",
        "m.reference_id AS referenceId",
        "v.id AS vendorId",
        "v.name AS vendorName",
        "m.reason AS reason",
        "m.created_at AS createdAt",
      ])
      .where("m.tenant_id = :tenantId", { tenantId })
      .andWhere("m.movement_type IN (:...types)", {
        types: ["PURCHASE_RECEIPT", "INVENTORY_OUT"],
      })
      .andWhere("m.created_at >= :from", { from })
      .andWhere("m.created_at < :toExclusive", { toExclusive })
      .orderBy("m.created_at", "DESC")
      .getRawMany<Record<string, unknown>>();

    const inboundItems: InventoryMovementListItem[] = [];
    const outboundItems: InventoryMovementListItem[] = [];
    const qtyByDay = new Map<string, { inboundQty: number; outboundQty: number }>();

    for (const r of rows) {
      const item = this.toReportListItem(r);
      const day = String(r.createdAt).slice(0, 10);
      const bucket = qtyByDay.get(day) ?? { inboundQty: 0, outboundQty: 0 };
      if (item.movementType === "PURCHASE_RECEIPT") {
        inboundItems.push(item);
        bucket.inboundQty += item.quantity;
      } else if (item.movementType === "INVENTORY_OUT") {
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

  private toReportListItem(r: Record<string, unknown>): InventoryMovementListItem {
    const createdAt = r.createdAt instanceof Date
      ? r.createdAt.toISOString()
      : String(r.createdAt ?? "");
    return {
      id: String(r.id),
      productSkuId: String(r.productSkuId),
      sku: String(r.sku ?? ""),
      variantName: String(r.variantName ?? ""),
      productId: r.productId != null ? String(r.productId) : undefined,
      productName: r.productName != null ? String(r.productName) : undefined,
      warehouseId: String(r.warehouseId),
      warehouseName: String(r.warehouseName ?? ""),
      movementType: String(r.movementType) as InventoryMovementType,
      quantity: toNum(String(r.quantity ?? "")),
      referenceType: (r.referenceType as string | null) ?? null,
      referenceId: (r.referenceId as string | null) ?? null,
      vendorId: r.vendorId != null ? String(r.vendorId) : null,
      vendorName: r.vendorName != null ? String(r.vendorName) : null,
      reason: String(r.reason ?? ""),
      createdAt,
    };
  }
}
