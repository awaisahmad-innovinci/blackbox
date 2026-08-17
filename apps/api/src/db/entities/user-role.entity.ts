import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from "typeorm";
import { Role } from "./role.entity";
import { Tenant } from "./tenant.entity";
import { User } from "./user.entity";

@Entity({ name: "user_roles" })
@Index("user_roles_tenant_id_idx", ["tenantId"])
@Index("user_roles_role_id_idx", ["roleId"])
export class UserRole {
  @PrimaryColumn({ name: "user_id", type: "uuid" })
  userId!: string;

  @PrimaryColumn({ name: "role_id", type: "uuid" })
  roleId!: string;

  @Column({ name: "tenant_id", type: "uuid" })
  tenantId!: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @ManyToOne(() => Tenant, { onDelete: "CASCADE" })
  @JoinColumn({ name: "tenant_id" })
  tenant!: Tenant;

  @ManyToOne(() => User, (user) => user.userRoles, { onDelete: "CASCADE" })
  @JoinColumn([
    { name: "tenant_id", referencedColumnName: "tenantId" },
    { name: "user_id", referencedColumnName: "id" },
  ])
  user!: User;

  @ManyToOne(() => Role, (role) => role.userRoles, { onDelete: "CASCADE" })
  @JoinColumn([
    { name: "tenant_id", referencedColumnName: "tenantId" },
    { name: "role_id", referencedColumnName: "id" },
  ])
  role!: Role;
}
