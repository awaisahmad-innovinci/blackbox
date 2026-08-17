import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  toPermissionResponse,
  type PermissionResponse,
} from "../common/admin-responses";
import { Permission } from "../db/entities/permission.entity";

@Injectable()
export class PermissionsCatalogService {
  constructor(
    @InjectRepository(Permission)
    private readonly permissions: Repository<Permission>,
  ) {}

  async list(): Promise<PermissionResponse[]> {
    const rows = await this.permissions.find({ order: { key: "ASC" } });
    return rows.map(toPermissionResponse);
  }
}
