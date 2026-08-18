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
import { VendorContact } from "./vendor-contact.entity";
import { VendorGroup } from "./vendor-group.entity";

@Entity({ name: "vendors" })
@Unique("vendors_tenant_id_vendor_code_key", ["tenantId", "vendorCode"])
@Index("vendors_tenant_id_idx", ["tenantId"])
@Index("vendors_group_id_idx", ["groupId"])
export class Vendor {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "tenant_id", type: "uuid" })
  tenantId!: string;

  @Column({ type: "text" })
  name!: string;

  @Column({ name: "vendor_code", type: "text" })
  vendorCode!: string;

  @Column({ name: "group_id", type: "uuid", nullable: true })
  groupId!: string | null;

  @Column({ type: "text", nullable: true })
  address!: string | null;

  @Column({ type: "text", nullable: true })
  city!: string | null;

  @Column({ type: "text", nullable: true })
  state!: string | null;

  @Column({ type: "text", nullable: true })
  country!: string | null;

  @Column({ name: "postal_code", type: "text", nullable: true })
  postalCode!: string | null;

  @Column({
    name: "sales_target",
    type: "numeric",
    precision: 14,
    scale: 4,
    nullable: true,
  })
  salesTarget!: string | null;

  @Column({
    name: "credit_limit",
    type: "numeric",
    precision: 14,
    scale: 4,
    nullable: true,
  })
  creditLimit!: string | null;

  @Column({ name: "payment_terms", type: "text", nullable: true })
  paymentTerms!: string | null;

  @Column({ name: "tax_number", type: "text", nullable: true })
  taxNumber!: string | null;

  @Column({ type: "text", default: "" })
  notes!: string;

  @Column({ type: "text", default: "active" })
  status!: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;

  @ManyToOne(() => Tenant, { onDelete: "CASCADE" })
  @JoinColumn({ name: "tenant_id" })
  tenant!: Tenant;

  @ManyToOne(() => VendorGroup, (group) => group.vendors, {
    onDelete: "SET NULL",
    nullable: true,
  })
  @JoinColumn({ name: "group_id" })
  group!: VendorGroup | null;

  @OneToMany(() => VendorContact, (contact) => contact.vendor)
  contacts!: VendorContact[];
}
