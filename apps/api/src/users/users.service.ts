import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import * as argon2 from "argon2";
import { DataSource, In, IsNull, Repository } from "typeorm";
import {
  toUserResponse,
  type UserResponse,
} from "../common/admin-responses";
import { isUniqueViolation } from "../common/db-errors";
import { DeviceUser } from "../db/entities/device-user.entity";
import { RefreshToken } from "../db/entities/refresh-token.entity";
import { Role } from "../db/entities/role.entity";
import { UserRole } from "../db/entities/user-role.entity";
import { User } from "../db/entities/user.entity";
import type { CreateUserDto } from "./dto/create-user.dto";
import type { ReplaceUserRolesDto } from "./dto/replace-user-roles.dto";
import type { UpdateUserDto } from "./dto/update-user.dto";

@Injectable()
export class UsersService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(UserRole)
    private readonly userRoles: Repository<UserRole>,
  ) {}

  async list(tenantId: string): Promise<UserResponse[]> {
    const users = await this.users.find({
      where: { tenantId },
      order: { createdAt: "ASC" },
    });
    const roleMap = await this.roleIdsByUserIds(
      tenantId,
      users.map((u) => u.id),
    );
    return users.map((u) => toUserResponse(u, roleMap.get(u.id) ?? []));
  }

  async getById(tenantId: string, userId: string): Promise<UserResponse> {
    const user = await this.findTenantUser(tenantId, userId);
    const roleIds = await this.roleIdsForUser(tenantId, user.id);
    return toUserResponse(user, roleIds);
  }

  async create(tenantId: string, dto: CreateUserDto): Promise<UserResponse> {
    const email = dto.email.trim().toLowerCase();
    const username = dto.username.trim();
    const passwordHash = await argon2.hash(dto.password);
    const roleIds = dto.roleIds ?? [];

    try {
      const user = await this.dataSource.transaction(async (manager) => {
        if (roleIds.length > 0) {
          await this.assertRolesInTenant(manager.getRepository(Role), tenantId, roleIds);
        }

        const created = manager.create(User, {
          tenantId,
          email,
          username,
          fullName: dto.fullName.trim(),
          passwordHash,
        });
        await manager.save(created);

        if (roleIds.length > 0) {
          await manager.save(
            roleIds.map((roleId) =>
              manager.create(UserRole, {
                tenantId,
                userId: created.id,
                roleId,
              }),
            ),
          );
        }

        return created;
      });

      return toUserResponse(user, roleIds);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException("Email or username already in use");
      }
      throw error;
    }
  }

  async update(
    tenantId: string,
    userId: string,
    dto: UpdateUserDto,
  ): Promise<UserResponse> {
    const user = await this.findTenantUser(tenantId, userId);

    if (dto.email !== undefined) {
      user.email = dto.email.trim().toLowerCase();
    }
    if (dto.username !== undefined) {
      user.username = dto.username.trim();
    }
    if (dto.fullName !== undefined) {
      user.fullName = dto.fullName.trim();
    }
    if (dto.password !== undefined) {
      user.passwordHash = await argon2.hash(dto.password);
    }

    try {
      await this.users.save(user);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException("Email or username already in use");
      }
      throw error;
    }

    const roleIds = await this.roleIdsForUser(tenantId, user.id);
    return toUserResponse(user, roleIds);
  }

  async deactivate(tenantId: string, userId: string): Promise<UserResponse> {
    const user = await this.dataSource.transaction(async (manager) => {
      const found = await manager.findOne(User, {
        where: { id: userId, tenantId },
      });
      if (!found) {
        throw new NotFoundException("User not found");
      }

      found.isActive = false;
      found.deactivatedAt = new Date();
      await manager.save(found);

      await manager.update(
        RefreshToken,
        { userId: found.id, tenantId, revokedAt: IsNull() },
        { revokedAt: new Date() },
      );

      await manager.update(
        DeviceUser,
        { userId: found.id, tenantId },
        { offlineEnabled: false },
      );

      return found;
    });

    const roleIds = await this.roleIdsForUser(tenantId, user.id);
    return toUserResponse(user, roleIds);
  }

  async replaceRoles(
    tenantId: string,
    userId: string,
    dto: ReplaceUserRolesDto,
  ): Promise<UserResponse> {
    const roleIds = dto.roleIds;

    const user = await this.dataSource.transaction(async (manager) => {
      const found = await manager.findOne(User, {
        where: { id: userId, tenantId },
      });
      if (!found) {
        throw new NotFoundException("User not found");
      }

      await this.assertRolesInTenant(
        manager.getRepository(Role),
        tenantId,
        roleIds,
      );

      await manager.delete(UserRole, { userId: found.id, tenantId });

      if (roleIds.length > 0) {
        await manager.save(
          roleIds.map((roleId) =>
            manager.create(UserRole, {
              tenantId,
              userId: found.id,
              roleId,
            }),
          ),
        );
      }

      return found;
    });

    return toUserResponse(user, roleIds);
  }

  private async findTenantUser(tenantId: string, userId: string): Promise<User> {
    const user = await this.users.findOne({ where: { id: userId, tenantId } });
    if (!user) {
      throw new NotFoundException("User not found");
    }
    return user;
  }

  private async roleIdsForUser(
    tenantId: string,
    userId: string,
  ): Promise<string[]> {
    const rows = await this.userRoles.find({
      where: { tenantId, userId },
      select: { roleId: true },
    });
    return rows.map((r) => r.roleId);
  }

  private async roleIdsByUserIds(
    tenantId: string,
    userIds: string[],
  ): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    if (userIds.length === 0) {
      return map;
    }
    const rows = await this.userRoles.find({
      where: { tenantId, userId: In(userIds) },
      select: { userId: true, roleId: true },
    });
    for (const row of rows) {
      const list = map.get(row.userId) ?? [];
      list.push(row.roleId);
      map.set(row.userId, list);
    }
    return map;
  }

  private async assertRolesInTenant(
    rolesRepo: Repository<Role>,
    tenantId: string,
    roleIds: string[],
  ): Promise<void> {
    if (roleIds.length === 0) {
      return;
    }
    const found = await rolesRepo.find({
      where: { tenantId, id: In(roleIds) },
      select: { id: true },
    });
    if (found.length !== roleIds.length) {
      throw new BadRequestException(
        "One or more roles are invalid for this tenant",
      );
    }
  }
}
