import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import * as QRCode from "qrcode";
import { TOTP, Secret } from "otpauth";
import { In, IsNull, Not, Repository } from "typeorm";
import type { TotpEnrollStartResponse, TotpStatusResponse } from "@blackbox/shared";
import { Role } from "../../db/entities/role.entity";
import { UserTotp } from "../../db/entities/user-totp.entity";
import { User } from "../../db/entities/user.entity";
import { UserRole } from "../../db/entities/user-role.entity";
import { decryptTotpSecret, encryptTotpSecret } from "./totp-crypto";

const SUPERVISOR_ROLE_KEYS = ["OWNER", "MANAGER"] as const;

@Injectable()
export class TotpService {
  constructor(
    private readonly config: ConfigService,
    @InjectRepository(UserTotp)
    private readonly userTotp: Repository<UserTotp>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(UserRole)
    private readonly userRoles: Repository<UserRole>,
    @InjectRepository(Role)
    private readonly roles: Repository<Role>,
  ) {}

  private encryptionKey(): string {
    return (
      this.config.get<string>("TOTP_ENCRYPTION_KEY") ??
      this.config.getOrThrow<string>("JWT_ACCESS_SECRET")
    );
  }

  async assertSupervisorRole(userId: string, tenantId: string): Promise<void> {
    const userRoleRows = await this.userRoles.find({
      where: { userId, tenantId },
      select: { roleId: true },
    });
    if (userRoleRows.length === 0) {
      throw new ForbiddenException(
        "Only Manager or Owner accounts can set up Authy",
      );
    }
    const roles = await this.roles.find({
      where: {
        tenantId,
        id: In(userRoleRows.map((row) => row.roleId)),
      },
    });
    const ok = roles.some((role) =>
      SUPERVISOR_ROLE_KEYS.includes(
        role.key as (typeof SUPERVISOR_ROLE_KEYS)[number],
      ),
    );
    if (!ok) {
      throw new ForbiddenException(
        "Only Manager or Owner accounts can set up Authy",
      );
    }
  }

  async status(userId: string, tenantId: string): Promise<TotpStatusResponse> {
    const row = await this.userTotp.findOne({
      where: { userId, tenantId },
    });
    return {
      enrolled: Boolean(row?.confirmedAt),
      confirmedAt: row?.confirmedAt?.toISOString() ?? null,
    };
  }

  async enrollStart(
    userId: string,
    tenantId: string,
  ): Promise<TotpEnrollStartResponse> {
    await this.assertSupervisorRole(userId, tenantId);

    const existing = await this.userTotp.findOne({
      where: { userId, tenantId, confirmedAt: Not(IsNull()) },
    });
    if (existing) {
      throw new ConflictException(
        "Authy is already configured. Reset before setting up again.",
      );
    }

    const user = await this.users.findOne({ where: { id: userId, tenantId } });
    if (!user) throw new NotFoundException("User not found");

    const secret = new Secret({ size: 20 });
    const totp = new TOTP({
      issuer: user.tenantId ? "Blackbox" : "Blackbox",
      // label: user.email,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret,
    });
    const otpauthUrl = totp.toString();
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl);

    const ciphertext = encryptTotpSecret(secret.base32, this.encryptionKey());

    const pending = await this.userTotp.findOne({
      where: { userId, tenantId },
    });
    if (pending) {
      pending.secretCiphertext = ciphertext;
      pending.confirmedAt = null;
      await this.userTotp.save(pending);
    } else {
      await this.userTotp.save(
        this.userTotp.create({
          tenantId,
          userId,
          secretCiphertext: ciphertext,
          confirmedAt: null,
        }),
      );
    }

    return { otpauthUrl, qrDataUrl };
  }

  async enrollConfirm(
    userId: string,
    tenantId: string,
    code: string,
  ): Promise<TotpStatusResponse> {
    await this.assertSupervisorRole(userId, tenantId);

    const row = await this.userTotp.findOne({
      where: { userId, tenantId },
    });
    if (!row) {
      throw new BadRequestException("Start Authy setup before confirming");
    }
    if (row.confirmedAt) {
      throw new ConflictException("Authy is already configured");
    }

    const secretBase32 = decryptTotpSecret(row.secretCiphertext, this.encryptionKey());
    const totp = new TOTP({
      secret: Secret.fromBase32(secretBase32),
      algorithm: "SHA1",
      digits: 6,
      period: 30,
    });

    const delta = totp.validate({ token: code, window: 1 });
    if (delta === null) {
      throw new BadRequestException("Invalid verification code");
    }

    row.confirmedAt = new Date();
    await this.userTotp.save(row);

    return this.status(userId, tenantId);
  }

  async reset(
    targetUserId: string,
    tenantId: string,
    actorUserId: string,
    canManageUsers: boolean,
  ): Promise<{ ok: true }> {
    if (targetUserId !== actorUserId) {
      if (!canManageUsers) {
        throw new ForbiddenException("Cannot reset another user's Authy");
      }
    } else {
      await this.assertSupervisorRole(actorUserId, tenantId);
    }

    await this.userTotp.delete({ userId: targetUserId, tenantId });
    return { ok: true };
  }

  async listSupervisorSecretsForDevice(
    tenantId: string,
  ): Promise<Array<{ userId: string; secret: string; fullName: string }>> {
    const supervisorRoles = await this.roles.find({
      where: { tenantId, key: In([...SUPERVISOR_ROLE_KEYS]) },
    });
    if (supervisorRoles.length === 0) return [];

    const roleIds = supervisorRoles.map((r) => r.id);
    const userRoleRows = await this.userRoles.find({
      where: { tenantId, roleId: In(roleIds) },
    });
    const supervisorUserIds = [...new Set(userRoleRows.map((r) => r.userId))];
    if (supervisorUserIds.length === 0) return [];

    const rows = await this.userTotp.find({
      where: {
        tenantId,
        userId: In(supervisorUserIds),
        confirmedAt: Not(IsNull()),
      },
    });

    const key = this.encryptionKey();
    const users = await this.users.find({
      where: { tenantId, id: In(supervisorUserIds) },
    });
    const nameById = new Map(
      users.map((user) => [
        user.id,
        user.fullName?.trim() || user.username || "Manager",
      ]),
    );

    return rows.map((row) => ({
      userId: row.userId,
      secret: decryptTotpSecret(row.secretCiphertext, key),
      fullName: nameById.get(row.userId) ?? "Manager",
    }));
  }
}
