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
import { GoodsReceipt } from "./goods-receipt.entity";
import { ProductSku } from "./product-sku.entity";
import { Tenant } from "./tenant.entity";
import { Unit } from "./unit.entity";
import { VendorReturn } from "./vendor-return.entity";
import { VendorSku } from "./vendor-sku.entity";

@Entity({ name: "vendor_return_items" })
@Index("vendor_return_items_tenant_id_idx", ["tenantId"])
@Index("vendor_return_items_return_id_idx", ["vendorReturnId"])
@Index("vendor_return_items_product_sku_id_idx", ["productSkuId"])
export class VendorReturnItem {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "tenant_id", type: "uuid" })
  tenantId!: string;

  @Column({ name: "vendor_return_id", type: "uuid" })
  vendorReturnId!: string;

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

  @Column({
    name: "unit_cost",
    type: "numeric",
    precision: 14,
    scale: 4,
    default: 0,
  })
  unitCost!: string;

  @Column({ type: "text" })
  reason!: string;

  @Column({ type: "text", nullable: true })
  settlement!: string | null;

  @Column({ name: "goods_receipt_id", type: "uuid", nullable: true })
  goodsReceiptId!: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;

  @ManyToOne(() => Tenant, { onDelete: "CASCADE" })
  @JoinColumn({ name: "tenant_id" })
  tenant!: Tenant;

  @ManyToOne(() => VendorReturn, (ret) => ret.items, { onDelete: "CASCADE" })
  @JoinColumn({ name: "vendor_return_id" })
  vendorReturn!: VendorReturn;

  @ManyToOne(() => ProductSku, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "product_sku_id" })
  productSku!: ProductSku;

  @ManyToOne(() => VendorSku, { onDelete: "RESTRICT", nullable: true })
  @JoinColumn({ name: "vendor_sku_id" })
  vendorSku!: VendorSku | null;

  @ManyToOne(() => Unit, { onDelete: "RESTRICT", nullable: true })
  @JoinColumn({ name: "purchase_unit_id" })
  purchaseUnit!: Unit | null;

  @ManyToOne(() => GoodsReceipt, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "goods_receipt_id" })
  goodsReceipt!: GoodsReceipt | null;
}
