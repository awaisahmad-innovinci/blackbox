import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type {
  EntityStatus,
  VendorGroup as VendorGroupDto,
} from "@blackbox/shared";
import {
  normalizeOptionalStoredText,
  normalizeStoredText,
} from "@blackbox/shared";
import { Repository } from "typeorm";
import { isUniqueViolation } from "../../common/db-errors";
import { VendorGroup } from "../../db/entities";
import { FixedTenantContext } from "../common/fixed-tenant.context";
import {
  CreateVendorGroupDto,
  ListTaxonomyQueryDto,
  UpdateVendorGroupDto,
} from "../common/dto/taxonomy.dto";

@Injectable()
export class VendorGroupsService {
  constructor(
    private readonly fixedTenant: FixedTenantContext,
    @InjectRepository(VendorGroup)
    private readonly groups: Repository<VendorGroup>,
  ) {}

  async list(query: ListTaxonomyQueryDto = {}): Promise<VendorGroupDto[]> {
    const tenantId = this.fixedTenant.tenantId;
    const qb = this.groups
      .createQueryBuilder("g")
      .where("g.tenant_id = :tenantId", { tenantId });

    const status = query.status ?? "active";
    if (status !== "all") {
      qb.andWhere("g.status = :status", { status });
    }
    if (query.q?.trim()) {
      const term = `%${query.q.trim().toLowerCase()}%`;
      qb.andWhere(
        "(LOWER(g.name) LIKE :term OR LOWER(COALESCE(g.description, '')) LIKE :term)",
        { term },
      );
    }

    const rows = await qb.orderBy("g.name", "ASC").getMany();
    return rows.map((g) => this.map(g));
  }

  async getById(id: string): Promise<VendorGroupDto> {
    return this.map(await this.require(id));
  }

  async create(dto: CreateVendorGroupDto): Promise<VendorGroupDto> {
    const tenantId = this.fixedTenant.tenantId;
    const row = this.groups.create({
      tenantId,
      name: normalizeStoredText(dto.name),
      description: normalizeOptionalStoredText(dto.description),
      status: dto.status ?? "active",
    });
    try {
      await this.groups.save(row);
      return this.map(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException("Vendor group name already exists");
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateVendorGroupDto): Promise<VendorGroupDto> {
    const row = await this.require(id);
    row.name = normalizeStoredText(dto.name);
    row.description = normalizeOptionalStoredText(dto.description);
    if (dto.status) row.status = dto.status;
    try {
      await this.groups.save(row);
      return this.map(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException("Vendor group name already exists");
      }
      throw error;
    }
  }

  async deactivate(id: string): Promise<VendorGroupDto> {
    const row = await this.require(id);
    row.status = "inactive";
    await this.groups.save(row);
    return this.map(row);
  }

  private async require(id: string): Promise<VendorGroup> {
    const row = await this.groups.findOne({
      where: { id, tenantId: this.fixedTenant.tenantId },
    });
    if (!row) throw new NotFoundException("Vendor group not found");
    return row;
  }

  private map(g: VendorGroup): VendorGroupDto {
    return {
      id: g.id,
      name: g.name,
      description: g.description,
      status: g.status as EntityStatus,
    };
  }
}
