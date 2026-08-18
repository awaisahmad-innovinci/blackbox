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
import { ProductSku } from "./product-sku.entity";
import { Tenant } from "./tenant.entity";
import { Unit } from "./unit.entity";
import { Vendor } from "./vendor.entity";

@Entity({ name: "vendor_skus" })
@Unique("vendor_skus_tenant_vendor_sku_key", [
  "tenantId",
  "vendorId",
  "productSkuId",
])
@Index("vendor_skus_tenant_id_idx", ["tenantId"])
@Index("vendor_skus_vendor_id_idx", ["vendorId"])
@Index("vendor_skus_product_sku_id_idx", ["productSkuId"])
export class VendorSku {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "tenant_id", type: "uuid" })
  tenantId!: string;

  @Column({ name: "vendor_id", type: "uuid" })
  vendorId!: string;

  @Column({ name: "product_sku_id", type: "uuid" })
  productSkuId!: string;

  @Column({ name: "vendor_sku_code", type: "text", nullable: true })
  vendorSkuCode!: string | null;

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

  @Column({
    name: "purchase_price",
    type: "numeric",
    precision: 14,
    scale: 4,
    default: 0,
  })
  purchasePrice!: string;

  @Column({
    name: "minimum_order_quantity",
    type: "numeric",
    precision: 14,
    scale: 4,
    default: 1,
  })
  minimumOrderQuantity!: string;

  @Column({ name: "lead_time_days", type: "int", default: 0 })
  leadTimeDays!: number;

  @Column({ name: "is_preferred", type: "boolean", default: false })
  isPreferred!: boolean;

  @Column({ type: "text", default: "active" })
  status!: string;

  @Column({ type: "text", default: "" })
  notes!: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;

  @ManyToOne(() => Tenant, { onDelete: "CASCADE" })
  @JoinColumn({ name: "tenant_id" })
  tenant!: Tenant;

  @ManyToOne(() => Vendor, { onDelete: "CASCADE" })
  @JoinColumn({ name: "vendor_id" })
  vendor!: Vendor;

  @ManyToOne(() => ProductSku, { onDelete: "CASCADE" })
  @JoinColumn({ name: "product_sku_id" })
  productSku!: ProductSku;

  @ManyToOne(() => Unit, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "purchase_unit_id" })
  purchaseUnit!: Unit | null;
}
