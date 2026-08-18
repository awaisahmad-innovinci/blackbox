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
import { ProductSku } from "./product-sku.entity";
import { PurchaseOrder } from "./purchase-order.entity";
import { Tenant } from "./tenant.entity";
import { Unit } from "./unit.entity";
import { VendorSku } from "./vendor-sku.entity";

@Entity({ name: "purchase_order_items" })
@Index("purchase_order_items_tenant_id_idx", ["tenantId"])
@Index("purchase_order_items_po_id_idx", ["purchaseOrderId"])
export class PurchaseOrderItem {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "tenant_id", type: "uuid" })
  tenantId!: string;

  @Column({ name: "purchase_order_id", type: "uuid" })
  purchaseOrderId!: string;

  @Column({ name: "product_sku_id", type: "uuid" })
  productSkuId!: string;

  @Column({ name: "vendor_sku_id", type: "uuid", nullable: true })
  vendorSkuId!: string | null;

  @Column({ name: "purchase_unit_id", type: "uuid", nullable: true })
  purchaseUnitId!: string | null;

  @Column({
    name: "units_per_purchase_unit",
    type: "numeric",
    precision: 14,
    scale: 4,
    default: 1,
  })
  unitsPerPurchaseUnit!: string;

  @Column({ type: "numeric", precision: 14, scale: 4 })
  quantity!: string;

  @Column({ name: "unit_cost", type: "numeric", precision: 14, scale: 4 })
  unitCost!: string;

  @Column({ type: "numeric", precision: 14, scale: 4, default: 0 })
  tax!: string;

  @Column({ type: "numeric", precision: 14, scale: 4, default: 0 })
  discount!: string;

  @Column({ name: "line_total", type: "numeric", precision: 14, scale: 4 })
  lineTotal!: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;

  @ManyToOne(() => Tenant, { onDelete: "CASCADE" })
  @JoinColumn({ name: "tenant_id" })
  tenant!: Tenant;

  @ManyToOne(() => PurchaseOrder, (po) => po.items, { onDelete: "CASCADE" })
  @JoinColumn({ name: "purchase_order_id" })
  purchaseOrder!: PurchaseOrder;

  @ManyToOne(() => ProductSku, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "product_sku_id" })
  productSku!: ProductSku;

  @ManyToOne(() => VendorSku, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "vendor_sku_id" })
  vendorSku!: VendorSku | null;

  @ManyToOne(() => Unit, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "purchase_unit_id" })
  purchaseUnit!: Unit | null;
}
