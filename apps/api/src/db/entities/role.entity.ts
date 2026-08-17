import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from "typeorm";
import { RolePermission } from "./role-permission.entity";
import { Tenant } from "./tenant.entity";
import { UserRole } from "./user-role.entity";

@Entity({ name: "roles" })
@Unique("roles_tenant_id_key_key", ["tenantId", "key"])
@Unique("roles_tenant_id_id_key", ["tenantId", "id"])
@Index("roles_tenant_id_idx", ["tenantId"])
export class Role {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "tenant_id", type: "uuid" })
  tenantId!: string;

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

  @ManyToOne(() => Tenant, (tenant) => tenant.roles, { onDelete: "CASCADE" })
  @JoinColumn({ name: "tenant_id" })
  tenant!: Tenant;

  @OneToMany(() => RolePermission, (rp) => rp.role)
  rolePermissions!: RolePermission[];

  @OneToMany(() => UserRole, (ur) => ur.role)
  userRoles!: UserRole[];
}
