import { timingSafeEqual } from "node:crypto";
import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import type {
  PlatformLoginResponse,
  PlatformTenantSummary,
  ResetPlatformOwnerPasswordResponse,
} from "@blackbox/shared";
import * as argon2 from "argon2";
import { DataSource, IsNull, Repository } from "typeorm";
import { AuthService } from "../auth/auth.service";
import type { SignupTenantDto } from "../auth/dto/signup-tenant.dto";
import { RefreshToken } from "../db/entities/refresh-token.entity";
import { Tenant } from "../db/entities/tenant.entity";
import { User } from "../db/entities/user.entity";

const PLATFORM_ACCESS_TTL_SECONDS = 8 * 60 * 60;

function credentialsMatch(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) {
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

@Injectable()
export class PlatformService {
  constructor(
    private readonly config: ConfigService,
    private readonly jwtService: JwtService,
    private readonly authService: AuthService,
    private readonly dataSource: DataSource,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async login(username: string, password: string): Promise<PlatformLoginResponse> {
    const expectedUser = this.config.get<string>("PLATFORM_ADMIN_USERNAME") ?? "";
    const expectedPassword =
      this.config.get<string>("PLATFORM_ADMIN_PASSWORD") ?? "";
    if (
      !expectedUser ||
      !expectedPassword ||
      !credentialsMatch(username, expectedUser) ||
      !credentialsMatch(password, expectedPassword)
    ) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const accessToken = await this.jwtService.signAsync(
      { kind: "platform", sub: "platform" },
      {
        secret: this.config.getOrThrow<string>("JWT_ACCESS_SECRET"),
        expiresIn: PLATFORM_ACCESS_TTL_SECONDS,
      },
    );

    return { accessToken, expiresIn: PLATFORM_ACCESS_TTL_SECONDS };
  }

  async listTenants(): Promise<PlatformTenantSummary[]> {
    const [tenants, owners] = await Promise.all([
      this.tenants.find({ order: { createdAt: "DESC" } }),
      this.ownerByTenantId(),
    ]);
    return tenants.map((tenant) =>
      this.toSummary(tenant, owners.get(tenant.id) ?? null),
    );
  }

  createTenant(dto: SignupTenantDto): Promise<PlatformTenantSummary> {
    return this.authService.createTenantWorkspace(dto);
  }

  async setTenantActive(
    id: string,
    isActive: boolean,
  ): Promise<PlatformTenantSummary> {
    const tenant = await this.tenants.findOne({ where: { id } });
    if (!tenant) {
      throw new NotFoundException("Tenant not found");
    }
    tenant.isActive = isActive;
    await this.tenants.save(tenant);
    const owners = await this.ownerByTenantId();
    return this.toSummary(tenant, owners.get(tenant.id) ?? null);
  }

  async resetOwnerPassword(
    id: string,
    password: string,
  ): Promise<ResetPlatformOwnerPasswordResponse> {
    const tenant = await this.tenants.findOne({ where: { id } });
    if (!tenant) {
      throw new NotFoundException("Tenant not found");
    }
    const owner = await this.users
      .createQueryBuilder("user")
      .innerJoin("user.userRoles", "userRole")
      .innerJoin("userRole.role", "role")
      .where("role.key = :key", { key: "OWNER" })
      .andWhere("user.tenantId = :tenantId", { tenantId: id })
      .getOne();
    if (!owner) {
      throw new NotFoundException("Tenant owner not found");
    }

    const passwordHash = await argon2.hash(password);
    const revokedAt = new Date();
    await this.dataSource.transaction(async (manager) => {
      owner.passwordHash = passwordHash;
      await manager.save(owner);
      await manager.update(
        RefreshToken,
        { userId: owner.id, revokedAt: IsNull() },
        { revokedAt },
      );
    });

    return {
      password,
      businessName: tenant.name,
      fullName: owner.fullName,
      email: owner.email,
      username: owner.username,
    };
  }

  private async ownerByTenantId(): Promise<Map<string, User>> {
    const owners = await this.users
      .createQueryBuilder("user")
      .innerJoin("user.userRoles", "userRole")
      .innerJoin("userRole.role", "role")
      .where("role.key = :key", { key: "OWNER" })
      .getMany();
    const byTenant = new Map<string, User>();
    for (const owner of owners) {
      if (!byTenant.has(owner.tenantId)) {
        byTenant.set(owner.tenantId, owner);
      }
    }
    return byTenant;
  }

  private toSummary(tenant: Tenant, owner: User | null): PlatformTenantSummary {
    return {
      id: tenant.id,
      name: tenant.name,
      isActive: tenant.isActive,
      createdAt: tenant.createdAt.toISOString(),
      owner: owner
        ? {
            fullName: owner.fullName,
            email: owner.email,
            username: owner.username,
          }
        : null,
    };
  }
}
