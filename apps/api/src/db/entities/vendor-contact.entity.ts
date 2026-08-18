import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from "typeorm";
import { Tenant } from "./tenant.entity";
import { Vendor } from "./vendor.entity";

@Entity({ name: "vendor_contacts" })
@Unique("vendor_contacts_tenant_vendor_type_key", [
  "tenantId",
  "vendorId",
  "contactType",
])
@Index("vendor_contacts_tenant_id_idx", ["tenantId"])
@Index("vendor_contacts_vendor_id_idx", ["vendorId"])
export class VendorContact {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "tenant_id", type: "uuid" })
  tenantId!: string;

  @Column({ name: "vendor_id", type: "uuid" })
  vendorId!: string;

  @Column({ name: "contact_type", type: "text" })
  contactType!: string;

  @Column({ type: "text", nullable: true })
  name!: string | null;

  @Column({ type: "text", nullable: true })
  phone!: string | null;

  @Column({ type: "text", nullable: true })
  email!: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;

  @ManyToOne(() => Tenant, { onDelete: "CASCADE" })
  @JoinColumn({ name: "tenant_id" })
  tenant!: Tenant;

  @ManyToOne(() => Vendor, (vendor) => vendor.contacts, { onDelete: "CASCADE" })
  @JoinColumn({ name: "vendor_id" })
  vendor!: Vendor;
}
