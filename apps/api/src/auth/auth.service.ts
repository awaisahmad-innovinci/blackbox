import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import * as argon2 from "argon2";
import { createHash, randomBytes } from "node:crypto";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  DEFAULT_ROLE_NAMES,
  DEFAULT_ROLE_PERMISSIONS,
  DEFAULT_ROLES,
  REFRESH_TOKEN_TTL_SECONDS,
  type AuthResponse,
  type AuthUser,
  type JwtPayload,
  type Permission,
} from "@blackbox/shared";
import { DataSource, IsNull, QueryFailedError, Repository } from "typeorm";
import { Permission as PermissionEntity } from "../db/entities/permission.entity";
import { RefreshToken } from "../db/entities/refresh-token.entity";
import { RolePermission } from "../db/entities/role-permission.entity";
import { Role } from "../db/entities/role.entity";
import { Tenant } from "../db/entities/tenant.entity";
import { UserRole } from "../db/entities/user-role.entity";
import { User } from "../db/entities/user.entity";
import { PermissionsService } from "../rbac/permissions.service";
import type { LoginDto } from "./dto/login.dto";
import type { SignupTenantDto } from "./dto/signup-tenant.dto";

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof QueryFailedError &&
    typeof error.driverError === "object" &&
    error.driverError !== null &&
    "code" in error.driverError &&
    error.driverError.code === "23505"
  );
}

@Injectable()
export class AuthService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly permissionsService: PermissionsService,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    @InjectRepository(PermissionEntity)
    private readonly permissions: Repository<PermissionEntity>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokens: Repository<RefreshToken>,
  ) {}

  private accessTtlSeconds(): number {
    return Number(
      this.config.get("JWT_ACCESS_TTL_SECONDS") ?? ACCESS_TOKEN_TTL_SECONDS,
    );
  }

  private refreshTtlSeconds(): number {
    return Number(
      this.config.get("JWT_REFRESH_TTL_SECONDS") ?? REFRESH_TOKEN_TTL_SECONDS,
    );
  }

  async signupTenant(dto: SignupTenantDto): Promise<AuthResponse> {
    const email = dto.email.trim().toLowerCase();
    const username = dto.username.trim();
    const passwordHash = await argon2.hash(dto.password);

    // Resolve catalog rows by stable permission key — never hard-coded UUIDs.
    const allPermissions = await this.permissions.find();
    const permissionIdByKey = new Map(
      allPermissions.map((p) => [p.key, p.id] as const),
    );

    for (const key of Object.values(DEFAULT_ROLE_PERMISSIONS).flat()) {
      if (!permissionIdByKey.has(key)) {
        throw new ConflictException(
          `Permission catalog missing key: ${key}. Run database migrations.`,
        );
      }
    }

    let user: User;
    try {
      user = await this.dataSource.transaction(async (manager) => {
        const tenant = manager.create(Tenant, {
          name: dto.businessName.trim(),
        });
        await manager.save(tenant);

        const roleIdByKey = new Map<string, string>();

        for (const roleKey of DEFAULT_ROLES) {
          const role = manager.create(Role, {
            tenantId: tenant.id,
            key: roleKey,
            name: DEFAULT_ROLE_NAMES[roleKey],
            isSystem: true,
          });
          await manager.save(role);
          roleIdByKey.set(roleKey, role.id);

          const permKeys = DEFAULT_ROLE_PERMISSIONS[roleKey];
          if (permKeys.length > 0) {
            const links = permKeys.map((key) =>
              manager.create(RolePermission, {
                roleId: role.id,
                permissionId: permissionIdByKey.get(key)!,
              }),
            );
            await manager.save(links);
          }
        }

        const created = manager.create(User, {
          tenantId: tenant.id,
          email,
          username,
          fullName: dto.fullName.trim(),
          passwordHash,
        });
        await manager.save(created);

        const ownerRoleId = roleIdByKey.get("OWNER");
        if (!ownerRoleId) {
          throw new ConflictException("OWNER role missing");
        }

        await manager.save(
          manager.create(UserRole, {
            tenantId: tenant.id,
            userId: created.id,
            roleId: ownerRoleId,
          }),
        );

        return created;
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException("Email or username already in use");
      }
      throw error;
    }

    return this.issueAuthResponse(user);
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    // client is behavior-only (web vs desktop); never an authorization mechanism.
    void dto.client;

    // Ambiguous cross-tenant matches (0 or >1) → same generic 401.
    const user = await this.findUserByIdentifier(dto.identifier);
    if (!user || !user.isActive) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const tenant = await this.tenants.findOne({ where: { id: user.tenantId } });
    if (!tenant?.isActive) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const valid = await argon2.verify(user.passwordHash, dto.password);
    if (!valid) {
      throw new UnauthorizedException("Invalid credentials");
    }

    return this.issueAuthResponse(user);
  }

  async refresh(rawRefreshToken: string): Promise<AuthResponse> {
    const tokenHash = this.hashToken(rawRefreshToken);
    const stored = await this.refreshTokens.findOne({
      where: { tokenHash, revokedAt: IsNull() },
    });

    if (!stored || stored.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    const user = await this.users.findOne({ where: { id: stored.userId } });
    if (!user?.isActive) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    const tenant = await this.tenants.findOne({ where: { id: user.tenantId } });
    if (!tenant?.isActive) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    const userPermissions =
      await this.permissionsService.getPermissionsForUser(
        user.id,
        user.tenantId,
      );
    const accessTtl = this.accessTtlSeconds();
    const refreshTtl = this.refreshTtlSeconds();

    const payload: JwtPayload = {
      sub: user.id,
      tenantId: user.tenantId,
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.config.getOrThrow<string>("JWT_ACCESS_SECRET"),
      expiresIn: accessTtl,
    });

    const newRefreshToken = randomBytes(48).toString("base64url");
    const newHash = this.hashToken(newRefreshToken);
    const expiresAt = new Date(Date.now() + refreshTtl * 1000);

    return this.dataSource.transaction(async (manager) => {
      const created = manager.create(RefreshToken, {
        userId: user.id,
        tenantId: user.tenantId,
        deviceId: stored.deviceId,
        tokenHash: newHash,
        expiresAt,
      });
      await manager.save(created);

      stored.revokedAt = new Date();
      stored.replacedBy = created.id;
      await manager.save(stored);

      return {
        user: this.toAuthUser(user, userPermissions),
        tokens: {
          accessToken,
          refreshToken: newRefreshToken,
          expiresIn: accessTtl,
        },
      } satisfies AuthResponse;
    });
  }

  async logout(refreshToken: string): Promise<{ success: true }> {
    const tokenHash = this.hashToken(refreshToken);
    const stored = await this.refreshTokens.findOne({
      where: { tokenHash, revokedAt: IsNull() },
    });
    if (stored) {
      stored.revokedAt = new Date();
      await this.refreshTokens.save(stored);
    }
    return { success: true };
  }

  async me(userId: string): Promise<AuthUser> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException("Invalid session");
    }
    const userPermissions =
      await this.permissionsService.getPermissionsForUser(
        user.id,
        user.tenantId,
      );
    return this.toAuthUser(user, userPermissions);
  }

  /**
   * Resolve login identifier without tenant_id.
   * Email/username are tenant-scoped, so multiple matches across tenants are
   * possible — treat 0 or >1 rows as "not found" (generic 401 at call site).
   */
  private async findUserByIdentifier(identifier: string): Promise<User | null> {
    const trimmed = identifier.trim();
    const isEmail = trimmed.includes("@");
    const value = isEmail ? trimmed.toLowerCase() : trimmed;

    const rows = await this.users.find({
      where: isEmail ? { email: value } : { username: value },
    });

    if (rows.length !== 1) {
      return null;
    }
    return rows[0] ?? null;
  }

  private async issueAuthResponse(user: User): Promise<AuthResponse> {
    const userPermissions =
      await this.permissionsService.getPermissionsForUser(
        user.id,
        user.tenantId,
      );

    const accessTtl = this.accessTtlSeconds();
    const refreshTtl = this.refreshTtlSeconds();

    const payload: JwtPayload = {
      sub: user.id,
      tenantId: user.tenantId,
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.config.getOrThrow<string>("JWT_ACCESS_SECRET"),
      expiresIn: accessTtl,
    });

    const refreshToken = randomBytes(48).toString("base64url");
    const tokenHash = this.hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + refreshTtl * 1000);

    // One active web refresh token per user (deviceId null): update in place.
    await this.dataSource.transaction(async (manager) => {
      const activeWeb = await manager.find(RefreshToken, {
        where: {
          userId: user.id,
          deviceId: IsNull(),
          revokedAt: IsNull(),
        },
        order: { createdAt: "DESC" },
      });

      const kept = activeWeb[0];
      const extras = activeWeb.slice(1);
      const now = new Date();

      if (kept) {
        kept.tokenHash = tokenHash;
        kept.expiresAt = expiresAt;
        kept.replacedBy = null;
        await manager.save(kept);
      } else {
        await manager.save(
          manager.create(RefreshToken, {
            userId: user.id,
            tenantId: user.tenantId,
            deviceId: null,
            tokenHash,
            expiresAt,
          }),
        );
      }

      for (const extra of extras) {
        extra.revokedAt = now;
        await manager.save(extra);
      }
    });

    return {
      user: this.toAuthUser(user, userPermissions),
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: accessTtl,
      },
    };
  }

  private toAuthUser(user: User, perms: Permission[]): AuthUser {
    return {
      id: user.id,
      tenantId: user.tenantId,
      email: user.email,
      username: user.username,
      fullName: user.fullName,
      permissions: perms,
    };
  }

  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }
}
