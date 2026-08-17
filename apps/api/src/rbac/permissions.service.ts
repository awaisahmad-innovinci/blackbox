import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { isPermission, type Permission } from "@blackbox/shared";
import { In, Repository } from "typeorm";
import { RolePermission } from "../db/entities/role-permission.entity";
import { UserRole } from "../db/entities/user-role.entity";

/**
 * Resolves effective permission keys for a user within a tenant.
 * `tenantId` must come from validated JWT context — never from the client.
 */
@Injectable()
export class PermissionsService {
  constructor(
    @InjectRepository(UserRole)
    private readonly userRoles: Repository<UserRole>,
    @InjectRepository(RolePermission)
    private readonly rolePermissions: Repository<RolePermission>,
  ) {}

  async getPermissionsForUser(
    userId: string,
    tenantId: string,
  ): Promise<Permission[]> {
    const userRoleRows = await this.userRoles.find({
      where: { userId, tenantId },
      select: { roleId: true },
    });

    if (userRoleRows.length === 0) {
      return [];
    }

    const roleIds = userRoleRows.map((r) => r.roleId);
    const rows = await this.rolePermissions.find({
      where: { roleId: In(roleIds) },
      relations: { permission: true },
    });

    const keys = new Set<Permission>();
    for (const row of rows) {
      if (isPermission(row.permission.key)) {
        keys.add(row.permission.key);
      }
    }
    return [...keys];
  }
}
