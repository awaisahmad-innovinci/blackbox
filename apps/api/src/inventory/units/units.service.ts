import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { EntityStatus, UnitListItem } from "@blackbox/shared";
import { Repository } from "typeorm";
import { Unit } from "../../db/entities";
import { FixedTenantContext } from "../common/fixed-tenant.context";

@Injectable()
export class UnitsService {
  constructor(
    private readonly fixedTenant: FixedTenantContext,
    @InjectRepository(Unit)
    private readonly units: Repository<Unit>,
  ) {}

  async list(): Promise<UnitListItem[]> {
    const rows = await this.units.find({
      where: { tenantId: this.fixedTenant.tenantId, status: "active" },
      order: { name: "ASC" },
    });
    return rows.map((u) => ({
      id: u.id,
      name: u.name,
      abbreviation: u.abbreviation,
      type: u.type,
      status: u.status as EntityStatus,
    }));
  }
}
