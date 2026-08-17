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
import { DeviceUser } from "./device-user.entity";
import { RefreshToken } from "./refresh-token.entity";
import { Tenant } from "./tenant.entity";
import { UserRole } from "./user-role.entity";

@Entity({ name: "users" })
@Unique("users_tenant_id_email_key", ["tenantId", "email"])
@Unique("users_tenant_id_username_key", ["tenantId", "username"])
@Unique("users_tenant_id_id_key", ["tenantId", "id"])
@Index("users_tenant_id_idx", ["tenantId"])
@Index("users_tenant_id_email_idx", ["tenantId", "email"])
@Index("users_tenant_id_username_idx", ["tenantId", "username"])
export class User {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "tenant_id", type: "uuid" })
  tenantId!: string;

  @Column({ type: "text" })
  email!: string;

  @Column({ type: "text" })
  username!: string;

  @Column({ name: "full_name", type: "text" })
  fullName!: string;

  @Column({ name: "password_hash", type: "text" })
  passwordHash!: string;

  @Column({ name: "is_active", type: "boolean", default: true })
  isActive!: boolean;

  @Column({ name: "deactivated_at", type: "timestamptz", nullable: true })
  deactivatedAt!: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;

  @ManyToOne(() => Tenant, (tenant) => tenant.users, { onDelete: "CASCADE" })
  @JoinColumn({ name: "tenant_id" })
  tenant!: Tenant;

  @OneToMany(() => UserRole, (ur) => ur.user)
  userRoles!: UserRole[];

  @OneToMany(() => DeviceUser, (du) => du.user)
  deviceUsers!: DeviceUser[];

  @OneToMany(() => RefreshToken, (rt) => rt.user)
  refreshTokens!: RefreshToken[];
}
