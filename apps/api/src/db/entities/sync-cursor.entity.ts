import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from "typeorm";
import { Device } from "./device.entity";
import { Tenant } from "./tenant.entity";

@Entity({ name: "sync_cursors" })
@Unique("sync_cursors_device_id_stream_key", ["deviceId", "stream"])
@Index("sync_cursors_tenant_id_idx", ["tenantId"])
export class SyncCursor {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "tenant_id", type: "uuid" })
  tenantId!: string;

  @Column({ name: "device_id", type: "uuid" })
  deviceId!: string;

  @Column({ type: "text" })
  stream!: string;

  @Column({ type: "text", default: "" })
  cursor!: string;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;

  @ManyToOne(() => Tenant, { onDelete: "CASCADE" })
  @JoinColumn({ name: "tenant_id" })
  tenant!: Tenant;

  @ManyToOne(() => Device, (device) => device.syncCursors, {
    onDelete: "CASCADE",
  })
  @JoinColumn([
    { name: "tenant_id", referencedColumnName: "tenantId" },
    { name: "device_id", referencedColumnName: "id" },
  ])
  device!: Device;
}
