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
import { VendorReturnItem } from "./vendor-return-item.entity";
import { Warehouse } from "./warehouse.entity";

@Entity({ name: "vendor_returns" })
@Unique("vendor_returns_tenant_return_number_key", ["tenantId", "returnNumber"])
@Index("vendor_returns_tenant_id_idx", ["tenantId"])
@Index("vendor_returns_vendor_id_idx", ["vendorId"])
@Index("vendor_returns_warehouse_id_idx", ["warehouseId"])
export class VendorReturn {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "tenant_id", type: "uuid" })
  tenantId!: string;

  @Column({ name: "return_number", type: "text" })
  returnNumber!: string;

  @Column({ name: "vendor_id", type: "uuid" })
  vendorId!: string;

  @Column({ name: "warehouse_id", type: "uuid" })
  warehouseId!: string;

  @Column({ name: "return_date", type: "date" })
  returnDate!: string;

  @Column({ type: "text", default: "" })
  notes!: string;

  @Column({ type: "text", default: "OPEN" })
  status!: string;

  @Column({ type: "numeric", precision: 14, scale: 4, default: 0 })
  subtotal!: string;

  @Column({ type: "numeric", precision: 14, scale: 4, default: 0 })
  total!: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;

  @ManyToOne(() => Tenant, { onDelete: "CASCADE" })
  @JoinColumn({ name: "tenant_id" })
  tenant!: Tenant;

  @ManyToOne(() => Vendor, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "vendor_id" })
  vendor!: Vendor;

  @ManyToOne(() => Warehouse, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "warehouse_id" })
  warehouse!: Warehouse;

  @OneToMany(() => VendorReturnItem, (item) => item.vendorReturn)
  items!: VendorReturnItem[];
}
