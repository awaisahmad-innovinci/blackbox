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
import { SyncCursor } from "./sync-cursor.entity";
import { Tenant } from "./tenant.entity";

@Entity({ name: "devices" })
@Unique("devices_tenant_id_fingerprint_key", ["tenantId", "fingerprint"])
@Unique("devices_tenant_id_id_key", ["tenantId", "id"])
@Index("devices_tenant_id_idx", ["tenantId"])
@Index("devices_tenant_id_status_idx", ["tenantId", "status"])
export class Device {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "tenant_id", type: "uuid" })
  tenantId!: string;

  @Column({ type: "text" })
  fingerprint!: string;

  @Column({ type: "text" })
  name!: string;

  /** DB check: pending | trusted | revoked */
  @Column({ type: "text", default: "pending" })
  status!: string;

  @Column({ name: "trusted_at", type: "timestamptz", nullable: true })
  trustedAt!: Date | null;

  @Column({ name: "revoked_at", type: "timestamptz", nullable: true })
  revokedAt!: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;

  @ManyToOne(() => Tenant, (tenant) => tenant.devices, { onDelete: "CASCADE" })
  @JoinColumn({ name: "tenant_id" })
  tenant!: Tenant;

  @OneToMany(() => DeviceUser, (du) => du.device)
  deviceUsers!: DeviceUser[];

  @OneToMany(() => RefreshToken, (rt) => rt.device)
  refreshTokens!: RefreshToken[];

  @OneToMany(() => SyncCursor, (sc) => sc.device)
  syncCursors!: SyncCursor[];
}
