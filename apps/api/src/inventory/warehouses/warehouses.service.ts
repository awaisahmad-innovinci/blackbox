import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { EntityStatus, WarehouseListItem } from "@blackbox/shared";
import { Repository } from "typeorm";
import { Warehouse } from "../../db/entities";
import { FixedTenantContext } from "../common/fixed-tenant.context";

@Injectable()
export class WarehousesService {
  constructor(
    private readonly fixedTenant: FixedTenantContext,
    @InjectRepository(Warehouse)
    private readonly warehouses: Repository<Warehouse>,
  ) {}

  async list(): Promise<WarehouseListItem[]> {
    const rows = await this.warehouses.find({
      where: { tenantId: this.fixedTenant.tenantId, status: "active" },
      order: { name: "ASC" },
    });
    return rows.map((w) => ({
      id: w.id,
      name: w.name,
      code: w.code,
      location: w.location,
      status: w.status as EntityStatus,
    }));
  }
}
