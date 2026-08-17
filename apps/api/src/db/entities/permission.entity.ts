import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";
import { RolePermission } from "./role-permission.entity";

@Entity({ name: "permissions" })
@Unique("permissions_key_key", ["key"])
@Index("permissions_key_idx", ["key"])
export class Permission {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "text" })
  key!: string;

  @Column({ type: "text", default: "" })
  description!: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @OneToMany(() => RolePermission, (rp) => rp.permission)
  rolePermissions!: RolePermission[];
}
