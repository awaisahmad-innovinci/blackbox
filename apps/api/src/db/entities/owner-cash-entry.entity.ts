import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { Tenant } from "./tenant.entity";
import { User } from "./user.entity";

@Entity({ name: "owner_cash_entries" })
@Index("owner_cash_entries_tenant_id_idx", ["tenantId"])
@Index("owner_cash_entries_recorded_by_idx", ["tenantId", "recordedByUserId"])
export class OwnerCashEntry {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "tenant_id", type: "uuid" })
  tenantId!: string;

  @Column({ name: "recorded_by_user_id", type: "uuid" })
  recordedByUserId!: string;

  @Column({ name: "recorded_by_name", type: "text", default: "" })
  recordedByName!: string;

  @Column({ type: "numeric", precision: 14, scale: 4 })
  amount!: string;

  @Column({ type: "text", default: "" })
  note!: string;

  @Column({ name: "recorded_at", type: "timestamptz" })
  recordedAt!: Date;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;

  @ManyToOne(() => Tenant, { onDelete: "CASCADE" })
  @JoinColumn({ name: "tenant_id" })
  tenant!: Tenant;

  @ManyToOne(() => User, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "recorded_by_user_id" })
  recordedByUser!: User;
}
