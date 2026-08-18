import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { Brand as BrandDto, EntityStatus } from "@blackbox/shared";
import { Repository } from "typeorm";
import { isUniqueViolation } from "../../common/db-errors";
import { Brand } from "../../db/entities";
import { FixedTenantContext } from "../common/fixed-tenant.context";
import {
  CreateBrandDto,
  ListTaxonomyQueryDto,
  UpdateBrandDto,
} from "../common/dto/taxonomy.dto";

@Injectable()
export class BrandsService {
  constructor(
    private readonly fixedTenant: FixedTenantContext,
    @InjectRepository(Brand)
    private readonly brands: Repository<Brand>,
  ) {}

  async list(query: ListTaxonomyQueryDto = {}): Promise<BrandDto[]> {
    const tenantId = this.fixedTenant.tenantId;
    const qb = this.brands
      .createQueryBuilder("b")
      .where("b.tenant_id = :tenantId", { tenantId });

    const status = query.status ?? "active";
    if (status !== "all") {
      qb.andWhere("b.status = :status", { status });
    }
    if (query.q?.trim()) {
      const term = `%${query.q.trim().toLowerCase()}%`;
      qb.andWhere(
        "(LOWER(b.name) LIKE :term OR LOWER(COALESCE(b.description, '')) LIKE :term)",
        { term },
      );
    }

    const rows = await qb.orderBy("b.name", "ASC").getMany();
    return rows.map((b) => this.map(b));
  }

  async getById(id: string): Promise<BrandDto> {
    return this.map(await this.require(id));
  }

  async create(dto: CreateBrandDto): Promise<BrandDto> {
    const tenantId = this.fixedTenant.tenantId;
    const row = this.brands.create({
      tenantId,
      name: dto.name.trim(),
      description: dto.description?.trim() ?? "",
      status: dto.status ?? "active",
    });
    try {
      await this.brands.save(row);
      return this.map(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException("Brand name already exists");
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateBrandDto): Promise<BrandDto> {
    const row = await this.require(id);
    row.name = dto.name.trim();
    row.description = dto.description?.trim() ?? "";
    if (dto.status) row.status = dto.status;
    try {
      await this.brands.save(row);
      return this.map(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException("Brand name already exists");
      }
      throw error;
    }
  }

  async deactivate(id: string): Promise<BrandDto> {
    const row = await this.require(id);
    row.status = "inactive";
    await this.brands.save(row);
    return this.map(row);
  }

  private async require(id: string): Promise<Brand> {
    const row = await this.brands.findOne({
      where: { id, tenantId: this.fixedTenant.tenantId },
    });
    if (!row) throw new NotFoundException("Brand not found");
    return row;
  }

  private map(b: Brand): BrandDto {
    return {
      id: b.id,
      name: b.name,
      description: b.description,
      status: b.status as EntityStatus,
    };
  }
}
