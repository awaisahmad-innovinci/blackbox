import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { Category as CategoryDto, EntityStatus } from "@blackbox/shared";
import { Repository } from "typeorm";
import { isUniqueViolation } from "../../common/db-errors";
import { Category } from "../../db/entities";
import { FixedTenantContext } from "../common/fixed-tenant.context";
import {
  CreateCategoryDto,
  ListTaxonomyQueryDto,
  UpdateCategoryDto,
} from "../common/dto/taxonomy.dto";

@Injectable()
export class CategoriesService {
  constructor(
    private readonly fixedTenant: FixedTenantContext,
    @InjectRepository(Category)
    private readonly categories: Repository<Category>,
  ) {}

  async list(query: ListTaxonomyQueryDto = {}): Promise<CategoryDto[]> {
    const tenantId = this.fixedTenant.tenantId;
    const qb = this.categories
      .createQueryBuilder("c")
      .where("c.tenant_id = :tenantId", { tenantId });

    const status = query.status ?? "active";
    if (status !== "all") {
      qb.andWhere("c.status = :status", { status });
    }
    if (query.q?.trim()) {
      const term = `%${query.q.trim().toLowerCase()}%`;
      qb.andWhere(
        "(LOWER(c.name) LIKE :term OR LOWER(COALESCE(c.description, '')) LIKE :term)",
        { term },
      );
    }

    const rows = await qb.orderBy("c.name", "ASC").getMany();
    return rows.map((c) => this.map(c));
  }

  async getById(id: string): Promise<CategoryDto> {
    return this.map(await this.require(id));
  }

  async create(dto: CreateCategoryDto): Promise<CategoryDto> {
    const tenantId = this.fixedTenant.tenantId;
    const row = this.categories.create({
      tenantId,
      name: dto.name.trim(),
      description: dto.description?.trim() ?? "",
      status: dto.status ?? "active",
    });
    try {
      await this.categories.save(row);
      return this.map(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException("Category name already exists");
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<CategoryDto> {
    const row = await this.require(id);
    row.name = dto.name.trim();
    row.description = dto.description?.trim() ?? "";
    if (dto.status) row.status = dto.status;
    try {
      await this.categories.save(row);
      return this.map(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException("Category name already exists");
      }
      throw error;
    }
  }

  async deactivate(id: string): Promise<CategoryDto> {
    const row = await this.require(id);
    row.status = "inactive";
    await this.categories.save(row);
    return this.map(row);
  }

  private async require(id: string): Promise<Category> {
    const row = await this.categories.findOne({
      where: { id, tenantId: this.fixedTenant.tenantId },
    });
    if (!row) throw new NotFoundException("Category not found");
    return row;
  }

  private map(c: Category): CategoryDto {
    return {
      id: c.id,
      name: c.name,
      description: c.description,
      status: c.status as EntityStatus,
    };
  }
}
