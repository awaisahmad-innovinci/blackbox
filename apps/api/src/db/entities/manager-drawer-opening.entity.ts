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

@Entity({ name: "manager_drawer_openings" })
@Index("manager_drawer_openings_tenant_id_idx", ["tenantId"])
@Index("manager_drawer_openings_manager_idx", ["tenantId", "managerUserId"])
export class ManagerDrawerOpening {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "tenant_id", type: "uuid" })
  tenantId!: string;

  @Column({ name: "manager_user_id", type: "uuid" })
  managerUserId!: string;

  @Column({ name: "manager_name", type: "text", default: "" })
  managerName!: string;

  @Column({ type: "numeric", precision: 14, scale: 4 })
  amount!: string;

  @Column({ name: "opened_by_user_id", type: "uuid" })
  openedByUserId!: string;

  @Column({ name: "opened_by_name", type: "text", default: "" })
  openedByName!: string;

  @Column({ name: "opened_at", type: "timestamptz" })
  openedAt!: Date;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;

  @ManyToOne(() => Tenant, { onDelete: "CASCADE" })
  @JoinColumn({ name: "tenant_id" })
  tenant!: Tenant;

  @ManyToOne(() => User, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "manager_user_id" })
  managerUser!: User;

  @ManyToOne(() => User, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "opened_by_user_id" })
  openedByUser!: User;
}
