import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { InjectRepository } from "@nestjs/typeorm";
import type { JwtPayload } from "@blackbox/shared";
import { ExtractJwt, Strategy } from "passport-jwt";
import { Repository } from "typeorm";
import type { TenantContext } from "../common/tenant-context";
import { Device } from "../db/entities/device.entity";
import { Tenant } from "../db/entities/tenant.entity";
import { User } from "../db/entities/user.entity";
import { PermissionsService } from "../rbac/permissions.service";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, "jwt") {
  constructor(
    config: ConfigService,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    @InjectRepository(Device) private readonly devices: Repository<Device>,
    private readonly permissionsService: PermissionsService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>("JWT_ACCESS_SECRET"),
    });
  }

  async validate(payload: JwtPayload): Promise<TenantContext> {
    // Tenant context always from validated JWT claims — never from request body.
    const user = await this.users.findOne({ where: { id: payload.sub } });

    if (!user || !user.isActive || user.tenantId !== payload.tenantId) {
      throw new UnauthorizedException("Invalid session");
    }

    const tenant = await this.tenants.findOne({ where: { id: user.tenantId } });
    if (!tenant?.isActive) {
      throw new UnauthorizedException("Tenant inactive");
    }

    const deviceId: string | null = payload.deviceId ?? null;
    if (deviceId) {
      const device = await this.devices.findOne({
        where: { id: deviceId, tenantId: user.tenantId },
      });
      if (!device || device.status === "revoked") {
        throw new UnauthorizedException("Device revoked or unknown");
      }
    }

    const userPermissions =
      await this.permissionsService.getPermissionsForUser(
        user.id,
        user.tenantId,
      );

    return {
      userId: user.id,
      tenantId: user.tenantId,
      email: user.email,
      permissions: userPermissions,
      deviceId,
    };
  }
}
