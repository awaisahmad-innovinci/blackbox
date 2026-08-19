import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Device } from "./device.entity";
import { Tenant } from "./tenant.entity";

@Entity({ name: "sync_conflicts" })
@Index("sync_conflicts_tenant_device_idx", ["tenantId", "deviceId", "resolution"])
export class SyncConflict {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "tenant_id", type: "uuid" })
  tenantId!: string;

  @Column({ name: "device_id", type: "uuid" })
  deviceId!: string;

  @Column({ type: "text" })
  stream!: string;

  @Column({ name: "entity_type", type: "text" })
  entityType!: string;

  @Column({ name: "entity_id", type: "uuid" })
  entityId!: string;

  @Column({ name: "local_change_id", type: "uuid" })
  localChangeId!: string;

  @Column({ name: "cloud_change_id", type: "uuid", nullable: true })
  cloudChangeId!: string | null;

  @Column({ type: "text" })
  reason!: string;

  @Column({ name: "local_payload", type: "jsonb", nullable: true })
  localPayload!: Record<string, unknown> | null;

  @Column({ name: "cloud_payload", type: "jsonb", nullable: true })
  cloudPayload!: Record<string, unknown> | null;

  @Column({ type: "text", default: "pending" })
  resolution!: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @Column({ name: "resolved_at", type: "timestamptz", nullable: true })
  resolvedAt!: Date | null;

  @ManyToOne(() => Tenant, { onDelete: "CASCADE" })
  @JoinColumn({ name: "tenant_id" })
  tenant!: Tenant;

  @ManyToOne(() => Device, { onDelete: "CASCADE" })
  @JoinColumn([
    { name: "tenant_id", referencedColumnName: "tenantId" },
    { name: "device_id", referencedColumnName: "id" },
  ])
  device!: Device;
}
