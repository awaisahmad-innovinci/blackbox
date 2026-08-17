import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";
import { Tenant } from "./tenant.entity";

@Entity({ name: "locations" })
@Index("locations_tenant_id_idx", ["tenantId"])
export class Location {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "tenant_id", type: "uuid" })
  tenantId!: string;

  @Column({ type: "text" })
  name!: string;

  @Column({ type: "text" })
  city!: string;

  @Column({ type: "text", nullable: true })
  address!: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;

  @ManyToOne(() => Tenant, (tenant) => tenant.locations, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "tenant_id" })
  tenant!: Tenant;
}
