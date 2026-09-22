import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { Tenant } from "./tenant.entity";
import { TillWithdrawal } from "./till-withdrawal.entity";
import { User } from "./user.entity";

@Entity({ name: "till_sessions" })
@Index("till_sessions_tenant_id_idx", ["tenantId"])
@Index("till_sessions_user_id_idx", ["userId"])
@Index("till_sessions_status_idx", ["status"])
export class TillSession {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "tenant_id", type: "uuid" })
  tenantId!: string;

  @Column({ name: "user_id", type: "uuid" })
  userId!: string;

  @Column({ name: "till_name", type: "text", default: "" })
  tillName!: string;

  @Column({ type: "text", default: "PENDING_APPROVAL" })
  status!: string;

  @Column({ name: "note_10", type: "int", default: 0 })
  note10!: number;

  @Column({ name: "note_20", type: "int", default: 0 })
  note20!: number;

  @Column({ name: "note_50", type: "int", default: 0 })
  note50!: number;

  @Column({ name: "note_100", type: "int", default: 0 })
  note100!: number;

  @Column({ name: "note_500", type: "int", default: 0 })
  note500!: number;

  @Column({ name: "note_1000", type: "int", default: 0 })
  note1000!: number;

  @Column({ name: "note_5000", type: "int", default: 0 })
  note5000!: number;

  @Column({
    name: "opening_total",
    type: "numeric",
    precision: 14,
    scale: 4,
    default: 0,
  })
  openingTotal!: string;

  @Column({
    name: "opening_balance",
    type: "numeric",
    precision: 14,
    scale: 4,
    default: 0,
  })
  openingBalance!: string;

  @Column({
    name: "current_cash_balance",
    type: "numeric",
    precision: 14,
    scale: 4,
    default: 0,
  })
  currentCashBalance!: string;

  @Column({
    name: "max_cash_limit",
    type: "numeric",
    precision: 14,
    scale: 4,
    default: 0,
  })
  maxCashLimit!: string;

  @Column({ name: "opened_at", type: "timestamptz", nullable: true })
  openedAt!: Date | null;

  @Column({ name: "closed_at", type: "timestamptz", nullable: true })
  closedAt!: Date | null;

  @Column({ name: "approved_by_user_id", type: "uuid", nullable: true })
  approvedByUserId!: string | null;

  @Column({ name: "approved_at", type: "timestamptz", nullable: true })
  approvedAt!: Date | null;

  @Column({ name: "reopened_by_user_id", type: "uuid", nullable: true })
  reopenedByUserId!: string | null;

  @Column({ name: "close_reason", type: "text", nullable: true })
  closeReason!: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;

  @ManyToOne(() => Tenant, { onDelete: "CASCADE" })
  @JoinColumn({ name: "tenant_id" })
  tenant!: Tenant;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: User;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "approved_by_user_id" })
  approvedByUser!: User | null;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "reopened_by_user_id" })
  reopenedByUser!: User | null;

  @OneToMany(() => TillWithdrawal, (withdrawal) => withdrawal.tillSession)
  withdrawals!: TillWithdrawal[];
}
