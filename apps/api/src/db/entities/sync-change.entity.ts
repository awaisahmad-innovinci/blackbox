import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";
import { Device } from "./device.entity";
import { Tenant } from "./tenant.entity";

@Entity({ name: "sync_changes" })
@Unique("sync_changes_tenant_seq_key", ["tenantId", "seq"])
@Unique("sync_changes_tenant_change_id_key", ["tenantId", "changeId"])
@Index("sync_changes_tenant_stream_seq_idx", ["tenantId", "stream", "seq"])
export class SyncChange {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "tenant_id", type: "uuid" })
  tenantId!: string;

  @Column({ type: "bigint" })
  seq!: string;

  @Column({ name: "change_id", type: "uuid" })
  changeId!: string;

  @Column({ name: "origin_device_id", type: "uuid" })
  originDeviceId!: string;

  @Column({ type: "text" })
  stream!: string;

  @Column({ name: "entity_type", type: "text" })
  entityType!: string;

  @Column({ name: "entity_id", type: "uuid" })
  entityId!: string;

  @Column({ type: "text" })
  operation!: string;

  @Column({ name: "entity_version", type: "int", default: 1 })
  entityVersion!: number;

  @Column({ type: "jsonb" })
  payload!: Record<string, unknown>;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @ManyToOne(() => Tenant, { onDelete: "CASCADE" })
  @JoinColumn({ name: "tenant_id" })
  tenant!: Tenant;

  @ManyToOne(() => Device, { onDelete: "RESTRICT" })
  @JoinColumn([
    { name: "tenant_id", referencedColumnName: "tenantId" },
    { name: "origin_device_id", referencedColumnName: "id" },
  ])
  originDevice!: Device;
}
