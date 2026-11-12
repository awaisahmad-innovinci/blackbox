import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, In, Repository } from "typeorm";
import {
  toRoleResponse,
  type RoleResponse,
} from "../common/admin-responses";
import { isUniqueViolation } from "../common/db-errors";
import { Permission } from "../db/entities/permission.entity";
import { RolePermission } from "../db/entities/role-permission.entity";
import { Role } from "../db/entities/role.entity";
import type { CreateRoleDto } from "./dto/create-role.dto";
import type { ReplaceRolePermissionsDto } from "./dto/replace-role-permissions.dto";
import type { UpdateRoleDto } from "./dto/update-role.dto";

@Injectable()
export class RolesService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Role) private readonly roles: Repository<Role>,
    @InjectRepository(RolePermission)
    private readonly rolePermissions: Repository<RolePermission>,
  ) {}

  async list(): Promise<RoleResponse[]> {
    const roles = await this.roles.find({
      order: { createdAt: "ASC" },
    });
    const permMap = await this.permissionIdsByRoleIds(roles.map((r) => r.id));
    return roles.map((r) => toRoleResponse(r, permMap.get(r.id) ?? []));
  }

  async getById(roleId: string): Promise<RoleResponse> {
    const role = await this.findRole(roleId);
    const permissionIds = await this.permissionIdsForRole(role.id);
    return toRoleResponse(role, permissionIds);
  }

  async create(dto: CreateRoleDto): Promise<RoleResponse> {
    const permissionIds = dto.permissionIds ?? [];

    try {
      const role = await this.dataSource.transaction(async (manager) => {
        if (permissionIds.length > 0) {
          await this.assertPermissionsExist(
            manager.getRepository(Permission),
            permissionIds,
          );
        }

        const created = manager.create(Role, {
          key: dto.key.trim(),
          name: dto.name.trim(),
          isSystem: false,
        });
        await manager.save(created);

        if (permissionIds.length > 0) {
          await manager.save(
            permissionIds.map((permissionId) =>
              manager.create(RolePermission, {
                roleId: created.id,
                permissionId,
              }),
            ),
          );
        }

        return created;
      });

      return toRoleResponse(role, permissionIds);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException("Role key already exists");
      }
      throw error;
    }
  }

  async update(roleId: string, dto: UpdateRoleDto): Promise<RoleResponse> {
    const role = await this.findRole(roleId);

    if (dto.key !== undefined) {
      if (role.isSystem) {
        throw new BadRequestException("System role keys cannot be changed");
      }
      role.key = dto.key.trim();
    }
    if (dto.name !== undefined) {
      role.name = dto.name.trim();
    }

    try {
      await this.roles.save(role);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException("Role key already exists");
      }
      throw error;
    }

    const permissionIds = await this.permissionIdsForRole(role.id);
    return toRoleResponse(role, permissionIds);
  }

  async replacePermissions(
    roleId: string,
    dto: ReplaceRolePermissionsDto,
  ): Promise<RoleResponse> {
    const permissionIds = dto.permissionIds;

    const role = await this.dataSource.transaction(async (manager) => {
      const found = await manager.findOne(Role, {
        where: { id: roleId },
      });
      if (!found) {
        throw new NotFoundException("Role not found");
      }

      await this.assertPermissionsExist(
        manager.getRepository(Permission),
        permissionIds,
      );

      await manager.delete(RolePermission, { roleId: found.id });

      if (permissionIds.length > 0) {
        await manager.save(
          permissionIds.map((permissionId) =>
            manager.create(RolePermission, {
              roleId: found.id,
              permissionId,
            }),
          ),
        );
      }

      return found;
    });

    return toRoleResponse(role, permissionIds);
  }

  private async findRole(roleId: string): Promise<Role> {
    const role = await this.roles.findOne({ where: { id: roleId } });
    if (!role) {
      throw new NotFoundException("Role not found");
    }
    return role;
  }

  private async permissionIdsForRole(roleId: string): Promise<string[]> {
    const rows = await this.rolePermissions.find({
      where: { roleId },
      select: { permissionId: true },
    });
    return rows.map((r) => r.permissionId);
  }

  private async permissionIdsByRoleIds(
    roleIds: string[],
  ): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    if (roleIds.length === 0) {
      return map;
    }
    const rows = await this.rolePermissions.find({
      where: { roleId: In(roleIds) },
      select: { roleId: true, permissionId: true },
    });
    for (const row of rows) {
      const list = map.get(row.roleId) ?? [];
      list.push(row.permissionId);
      map.set(row.roleId, list);
    }
    return map;
  }

  private async assertPermissionsExist(
    permissionsRepo: Repository<Permission>,
    permissionIds: string[],
  ): Promise<void> {
    if (permissionIds.length === 0) {
      return;
    }
    const found = await permissionsRepo.find({
      where: { id: In(permissionIds) },
      select: { id: true },
    });
    if (found.length !== permissionIds.length) {
      throw new BadRequestException(
        "One or more permission IDs do not exist in the catalog",
      );
    }
  }
}
