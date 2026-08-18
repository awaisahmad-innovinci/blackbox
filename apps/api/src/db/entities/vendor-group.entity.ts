import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from "typeorm";
import { Tenant } from "./tenant.entity";
import { Vendor } from "./vendor.entity";

@Entity({ name: "vendor_groups" })
@Unique("vendor_groups_tenant_id_name_key", ["tenantId", "name"])
@Index("vendor_groups_tenant_id_idx", ["tenantId"])
export class VendorGroup {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "tenant_id", type: "uuid" })
  tenantId!: string;

  @Column({ type: "text" })
  name!: string;

  @Column({ type: "text", default: "" })
  description!: string;

  @Column({ type: "text", default: "active" })
  status!: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;

  @ManyToOne(() => Tenant, { onDelete: "CASCADE" })
  @JoinColumn({ name: "tenant_id" })
  tenant!: Tenant;

  @OneToMany(() => Vendor, (vendor) => vendor.group)
  vendors!: Vendor[];
}
