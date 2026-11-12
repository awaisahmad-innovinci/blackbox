import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from "typeorm";
import { Tenant } from "./tenant.entity";
import { User } from "./user.entity";

@Entity({ name: "activity_logs" })
@Index("activity_logs_tenant_id_idx", ["tenantId"])
@Index("activity_logs_created_at_idx", ["createdAt"])
@Index("activity_logs_event_type_idx", ["eventType"])
export class ActivityLog {
  @PrimaryColumn("uuid")
  id!: string;

  @Column({ name: "tenant_id", type: "uuid" })
  tenantId!: string;

  @Column({ name: "event_type", type: "text" })
  eventType!: string;

  @Column({ name: "actor_user_id", type: "uuid" })
  actorUserId!: string;

  @Column({ name: "supervisor_user_id", type: "uuid", nullable: true })
  supervisorUserId!: string | null;

  @Column({ name: "subject_user_id", type: "uuid", nullable: true })
  subjectUserId!: string | null;

  @Column({ type: "text" })
  summary!: string;

  @Column({ type: "jsonb", default: {} })
  metadata!: Record<string, unknown>;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @ManyToOne(() => Tenant, { onDelete: "CASCADE" })
  @JoinColumn({ name: "tenant_id" })
  tenant!: Tenant;

  @ManyToOne(() => User, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "actor_user_id" })
  actorUser!: User;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "supervisor_user_id" })
  supervisorUser!: User | null;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "subject_user_id" })
  subjectUser!: User | null;
}
