import {
  BadRequestException,
  Injectable,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import * as argon2 from "argon2";
import { createHash, randomInt } from "node:crypto";
import { DataSource, IsNull, MoreThan, Repository } from "typeorm";
import { PasswordResetCode } from "../db/entities/password-reset-code.entity";
import { RefreshToken } from "../db/entities/refresh-token.entity";
import { User } from "../db/entities/user.entity";
import { MailService } from "../mail/mail.service";
import type { ForgotPasswordDto } from "./dto/forgot-password.dto";
import type { ResetPasswordDto } from "./dto/reset-password.dto";

const GENERIC_FORGOT_MESSAGE =
  "If an account exists for this email, we sent a verification code.";

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(PasswordResetCode)
    private readonly resetCodes: Repository<PasswordResetCode>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokens: Repository<RefreshToken>,
  ) {}

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.findOwnerByEmail(email);

    if (user) {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const recentCount = await this.resetCodes.count({
        where: {
          userId: user.id,
          createdAt: MoreThan(oneHourAgo),
        },
      });
      if (recentCount < 3) {
        try {
          await this.issueResetCode(user);
        } catch (err: unknown) {
          this.logger.error(
            `Failed to send password reset email for ${email}`,
            err instanceof Error ? err.stack : String(err),
          );
        }
      }
    }

    return { message: GENERIC_FORGOT_MESSAGE };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.findOwnerByEmail(email);
    if (!user) {
      throw new BadRequestException("Invalid or expired verification code");
    }

    const codeHash = this.hashCode(dto.code.trim());
    const row = await this.resetCodes.findOne({
      where: {
        userId: user.id,
        codeHash,
        usedAt: IsNull(),
      },
      order: { createdAt: "DESC" },
    });

    if (!row || row.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException("Invalid or expired verification code");
    }

    const passwordHash = await argon2.hash(dto.newPassword);

    await this.dataSource.transaction(async (manager) => {
      user.passwordHash = passwordHash;
      await manager.save(user);

      row.usedAt = new Date();
      await manager.save(row);

      await manager.update(
        RefreshToken,
        { userId: user.id, revokedAt: IsNull() },
        { revokedAt: new Date() },
      );
    });

    return { message: "Password updated. You can sign in with your new password." };
  }

  private async issueResetCode(user: User): Promise<void> {
    const ttlSeconds = Number(
      this.config.get("PASSWORD_RESET_OTP_TTL_SECONDS") ?? 600,
    );
    const code = String(randomInt(100000, 1000000));
    const codeHash = this.hashCode(code);
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    await this.dataSource.transaction(async (manager) => {
      await manager.update(
        PasswordResetCode,
        { userId: user.id, usedAt: IsNull() },
        { usedAt: new Date() },
      );
      await manager.save(
        manager.create(PasswordResetCode, {
          userId: user.id,
          codeHash,
          expiresAt,
        }),
      );
    });

    await this.mail.sendPasswordResetOtp(user.email, code);
  }

  private async findOwnerByEmail(email: string): Promise<User | null> {
    const rows = await this.users
      .createQueryBuilder("u")
      .innerJoin("u.userRoles", "ur")
      .innerJoin("ur.role", "r")
      .innerJoin("u.tenant", "t")
      .where("LOWER(u.email) = :email", { email })
      .andWhere("u.is_active = true")
      .andWhere("t.is_active = true")
      .andWhere("r.key = :ownerKey", { ownerKey: "OWNER" })
      .getMany();

    if (rows.length !== 1) {
      return null;
    }
    return rows[0] ?? null;
  }

  private hashCode(code: string): string {
    return createHash("sha256").update(code).digest("hex");
  }
}
