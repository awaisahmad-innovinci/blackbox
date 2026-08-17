import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";
import { Device } from "./device.entity";
import { Tenant } from "./tenant.entity";
import { User } from "./user.entity";

@Entity({ name: "device_users" })
@Index("device_users_tenant_id_idx", ["tenantId"])
@Index("device_users_user_id_idx", ["userId"])
export class DeviceUser {
  @PrimaryColumn({ name: "device_id", type: "uuid" })
  deviceId!: string;

  @PrimaryColumn({ name: "user_id", type: "uuid" })
  userId!: string;

  @Column({ name: "tenant_id", type: "uuid" })
  tenantId!: string;

  @Column({ name: "offline_enabled", type: "boolean", default: true })
  offlineEnabled!: boolean;

  @Column({ name: "offline_expires_at", type: "timestamptz", nullable: true })
  offlineExpiresAt!: Date | null;

  @Column({ name: "last_online_at", type: "timestamptz", nullable: true })
  lastOnlineAt!: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;

  @ManyToOne(() => Tenant, { onDelete: "CASCADE" })
  @JoinColumn({ name: "tenant_id" })
  tenant!: Tenant;

  @ManyToOne(() => Device, (device) => device.deviceUsers, {
    onDelete: "CASCADE",
  })
  @JoinColumn([
    { name: "tenant_id", referencedColumnName: "tenantId" },
    { name: "device_id", referencedColumnName: "id" },
  ])
  device!: Device;

  @ManyToOne(() => User, (user) => user.deviceUsers, { onDelete: "CASCADE" })
  @JoinColumn([
    { name: "tenant_id", referencedColumnName: "tenantId" },
    { name: "user_id", referencedColumnName: "id" },
  ])
  user!: User;
}
