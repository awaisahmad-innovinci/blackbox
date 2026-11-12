import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from "typeorm";
import { RolePermission } from "./role-permission.entity";
import { UserRole } from "./user-role.entity";

@Entity({ name: "roles" })
@Unique("roles_key_key", ["key"])
export class Role {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "text" })
  key!: string;

  @Column({ type: "text" })
  name!: string;

  @Column({ name: "is_system", type: "boolean", default: false })
  isSystem!: boolean;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;

  @OneToMany(() => RolePermission, (rp) => rp.role)
  rolePermissions!: RolePermission[];

  @OneToMany(() => UserRole, (ur) => ur.role)
  userRoles!: UserRole[];
}
