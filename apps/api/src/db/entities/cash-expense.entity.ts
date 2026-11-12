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

@Entity({ name: "cash_expenses" })
@Index("cash_expenses_tenant_id_idx", ["tenantId"])
@Index("cash_expenses_recorded_by_idx", ["tenantId", "recordedByUserId"])
@Index("cash_expenses_occurred_at_idx", ["tenantId", "occurredAt"])
export class CashExpense {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "tenant_id", type: "uuid" })
  tenantId!: string;

  @Column({ name: "recorded_by_user_id", type: "uuid" })
  recordedByUserId!: string;

  @Column({ name: "recorded_by_name", type: "text", default: "" })
  recordedByName!: string;

  @Column({ type: "text" })
  category!: string;

  @Column({ type: "numeric", precision: 14, scale: 4 })
  amount!: string;

  @Column({ type: "text", default: "" })
  note!: string;

  @Column({ name: "occurred_at", type: "timestamptz" })
  occurredAt!: Date;

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
