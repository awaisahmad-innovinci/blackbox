import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Tenant } from "./tenant.entity";
import { TillSession } from "./till-session.entity";
import { User } from "./user.entity";

@Entity({ name: "till_withdrawals" })
@Index("till_withdrawals_tenant_id_idx", ["tenantId"])
@Index("till_withdrawals_till_session_id_idx", ["tillSessionId"])
export class TillWithdrawal {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "tenant_id", type: "uuid" })
  tenantId!: string;

  @Column({ name: "till_session_id", type: "uuid" })
  tillSessionId!: string;

  @Column({ name: "withdrawn_by_user_id", type: "uuid" })
  withdrawnByUserId!: string;

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
    name: "withdrawal_total",
    type: "numeric",
    precision: 14,
    scale: 4,
    default: 0,
  })
  withdrawalTotal!: string;

  @Column({ type: "text", default: "full" })
  kind!: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @ManyToOne(() => Tenant, { onDelete: "CASCADE" })
  @JoinColumn({ name: "tenant_id" })
  tenant!: Tenant;

  @ManyToOne(() => TillSession, (session) => session.withdrawals, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "till_session_id" })
  tillSession!: TillSession;

  @ManyToOne(() => User, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "withdrawn_by_user_id" })
  withdrawnByUser!: User;
}
