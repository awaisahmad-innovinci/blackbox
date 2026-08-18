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
import { PurchaseOrderItem } from "./purchase-order-item.entity";
import { Tenant } from "./tenant.entity";
import { Vendor } from "./vendor.entity";
import { Warehouse } from "./warehouse.entity";

@Entity({ name: "purchase_orders" })
@Unique("purchase_orders_tenant_po_number_key", ["tenantId", "poNumber"])
@Index("purchase_orders_tenant_id_idx", ["tenantId"])
@Index("purchase_orders_vendor_id_idx", ["vendorId"])
@Index("purchase_orders_status_idx", ["status"])
export class PurchaseOrder {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "tenant_id", type: "uuid" })
  tenantId!: string;

  @Column({ name: "po_number", type: "text" })
  poNumber!: string;

  @Column({ name: "vendor_id", type: "uuid" })
  vendorId!: string;

  @Column({ name: "warehouse_id", type: "uuid" })
  warehouseId!: string;

  @Column({ type: "text", default: "DRAFT" })
  status!: string;

  @Column({ name: "order_date", type: "date" })
  orderDate!: string;

  @Column({ name: "expected_date", type: "date", nullable: true })
  expectedDate!: string | null;

  @Column({ type: "numeric", precision: 14, scale: 4, default: 0 })
  subtotal!: string;

  @Column({ type: "numeric", precision: 14, scale: 4, default: 0 })
  discount!: string;

  @Column({ type: "numeric", precision: 14, scale: 4, default: 0 })
  tax!: string;

  @Column({
    name: "other_charges",
    type: "numeric",
    precision: 14,
    scale: 4,
    default: 0,
  })
  otherCharges!: string;

  @Column({ type: "numeric", precision: 14, scale: 4, default: 0 })
  total!: string;

  @Column({ type: "text", default: "" })
  notes!: string;

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

  @OneToMany(() => PurchaseOrderItem, (item) => item.purchaseOrder)
  items!: PurchaseOrderItem[];
}
