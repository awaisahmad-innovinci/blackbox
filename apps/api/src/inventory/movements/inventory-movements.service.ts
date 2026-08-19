import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type {
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

    const items: InventoryMovementListItem[] = rows.map((m) => ({
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
    }));

    return { items, total, page, pageSize };
  }
}
