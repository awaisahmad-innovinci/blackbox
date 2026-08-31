import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { EntityStatus, WarehouseListItem } from "@blackbox/shared";
import { Repository } from "typeorm";
import { isUniqueViolation } from "../../common/db-errors";
import { Warehouse } from "../../db/entities";
import { FixedTenantContext } from "../common/fixed-tenant.context";
import {
  CreateWarehouseDto,
  ListWarehousesQueryDto,
  UpdateWarehouseDto,
} from "./dto/warehouse.dto";

@Injectable()
export class WarehousesService {
  constructor(
    private readonly fixedTenant: FixedTenantContext,
    @InjectRepository(Warehouse)
    private readonly warehouses: Repository<Warehouse>,
  ) {}

  async list(query: ListWarehousesQueryDto = {}): Promise<WarehouseListItem[]> {
    const tenantId = this.fixedTenant.tenantId;
    const qb = this.warehouses
      .createQueryBuilder("w")
      .where("w.tenant_id = :tenantId", { tenantId });

    const status = query.status ?? "active";
    if (status !== "all") {
      qb.andWhere("w.status = :status", { status });
    }
    if (query.q?.trim()) {
      const term = `%${query.q.trim().toLowerCase()}%`;
      qb.andWhere(
        "(LOWER(w.name) LIKE :term OR LOWER(w.code) LIKE :term OR LOWER(COALESCE(w.location, '')) LIKE :term)",
        { term },
      );
    }

    const rows = await qb.orderBy("w.name", "ASC").getMany();
    return rows.map((w) => this.map(w));
  }

  async getById(id: string): Promise<WarehouseListItem> {
    return this.map(await this.require(id));
  }

  async create(dto: CreateWarehouseDto): Promise<WarehouseListItem> {
    const tenantId = this.fixedTenant.tenantId;
    const row = this.warehouses.create({
      tenantId,
      name: dto.name.trim(),
      code: dto.code.trim(),
      location: dto.location?.trim() ? dto.location.trim() : null,
      status: dto.status ?? "active",
    });
    try {
      await this.warehouses.save(row);
      return this.map(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException("Warehouse code already exists");
      }
      throw error;
    }
  }

  async update(
    id: string,
    dto: UpdateWarehouseDto,
  ): Promise<WarehouseListItem> {
    const row = await this.require(id);
    row.name = dto.name.trim();
    row.code = dto.code.trim();
    row.location = dto.location?.trim() ? dto.location.trim() : null;
    if (dto.status) row.status = dto.status;
    try {
      await this.warehouses.save(row);
      return this.map(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException("Warehouse code already exists");
      }
      throw error;
    }
  }

  async deactivate(id: string): Promise<WarehouseListItem> {
    const row = await this.require(id);
    row.status = "inactive";
    await this.warehouses.save(row);
    return this.map(row);
  }

  private async require(id: string): Promise<Warehouse> {
    const row = await this.warehouses.findOne({
      where: { id, tenantId: this.fixedTenant.tenantId },
    });
    if (!row) throw new NotFoundException("Warehouse not found");
    return row;
  }

  private map(w: Warehouse): WarehouseListItem {
    return {
      id: w.id,
      name: w.name,
      code: w.code,
      location: w.location,
      status: w.status as EntityStatus,
    };
  }
}
