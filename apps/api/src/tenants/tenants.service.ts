import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";
import {
  toTenantResponse,
  type TenantResponse,
} from "../common/admin-responses";
import { Location } from "../db/entities/location.entity";
import { Tenant } from "../db/entities/tenant.entity";
import type { OnboardingBusinessDto } from "./dto/onboarding-business.dto";
import type { OnboardingLocationDto } from "./dto/onboarding-location.dto";
import type { UpdateTenantDto } from "./dto/update-tenant.dto";

@Injectable()
export class TenantsService {
  constructor(
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    private readonly dataSource: DataSource,
  ) {}

  async getCurrent(tenantId: string): Promise<TenantResponse> {
    const tenant = await this.tenants.findOne({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException("Tenant not found");
    }
    return toTenantResponse(tenant);
  }

  async updateCurrent(
    tenantId: string,
    dto: UpdateTenantDto,
  ): Promise<TenantResponse> {
    const tenant = await this.tenants.findOne({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException("Tenant not found");
    }
    tenant.name = dto.name.trim();
    await this.tenants.save(tenant);
    return toTenantResponse(tenant);
  }

  async saveOnboardingBusiness(
    tenantId: string,
    dto: OnboardingBusinessDto,
  ): Promise<TenantResponse> {
    const tenant = await this.tenants.findOne({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException("Tenant not found");
    }
    if (tenant.onboardingCompletedAt != null) {
      throw new ConflictException("Onboarding already completed");
    }

    tenant.businessType = dto.businessType;
    tenant.country = dto.country;
    tenant.currency = dto.currency;
    await this.tenants.save(tenant);
    return toTenantResponse(tenant);
  }

  async completeOnboardingLocation(
    tenantId: string,
    dto: OnboardingLocationDto,
  ): Promise<TenantResponse> {
    const tenant = await this.tenants.findOne({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException("Tenant not found");
    }
    if (tenant.onboardingCompletedAt != null) {
      throw new ConflictException("Onboarding already completed");
    }
    if (!tenant.businessType || !tenant.country || !tenant.currency) {
      throw new ConflictException(
        "Complete business information before adding a location",
      );
    }

    const address =
      dto.address === undefined || dto.address.trim() === ""
        ? null
        : dto.address.trim();

    await this.dataSource.transaction(async (manager) => {
      const location = manager.create(Location, {
        tenantId,
        name: dto.name.trim(),
        city: dto.city.trim(),
        address,
      });
      await manager.save(location);

      tenant.onboardingCompletedAt = new Date();
      await manager.save(tenant);
    });

    const updated = await this.tenants.findOne({ where: { id: tenantId } });
    if (!updated) {
      throw new NotFoundException("Tenant not found");
    }
    return toTenantResponse(updated);
  }
}
