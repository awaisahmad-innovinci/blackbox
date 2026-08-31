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
import { PurchaseOrderItem } from "./purchase-order-item.entity";
import { Tenant } from "./tenant.entity";
import { Unit } from "./unit.entity";
import { VendorSku } from "./vendor-sku.entity";

@Entity({ name: "goods_receipt_items" })
@Index("goods_receipt_items_tenant_id_idx", ["tenantId"])
@Index("goods_receipt_items_gr_id_idx", ["goodsReceiptId"])
export class GoodsReceiptItem {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "tenant_id", type: "uuid" })
  tenantId!: string;

  @Column({ name: "goods_receipt_id", type: "uuid" })
  goodsReceiptId!: string;

  @Column({ name: "purchase_order_item_id", type: "uuid", nullable: true })
  purchaseOrderItemId!: string | null;

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

  @Column({
    name: "ordered_quantity",
    type: "numeric",
    precision: 14,
    scale: 4,
    default: 0,
  })
  orderedQuantity!: string;

  @Column({
    name: "received_quantity",
    type: "numeric",
    precision: 14,
    scale: 4,
  })
  receivedQuantity!: string;

  @Column({
    name: "bonus_quantity",
    type: "numeric",
    precision: 14,
    scale: 4,
    default: 0,
  })
  bonusQuantity!: string;

  @Column({
    name: "po_unit_cost",
    type: "numeric",
    precision: 14,
    scale: 4,
    default: 0,
  })
  poUnitCost!: string;

  @Column({
    name: "receiving_unit_cost",
    type: "numeric",
    precision: 14,
    scale: 4,
    default: 0,
  })
  receivingUnitCost!: string;

  @Column({
    name: "discount_percent",
    type: "numeric",
    precision: 8,
    scale: 4,
    default: 0,
  })
  discountPercent!: string;

  @Column({
    name: "line_total",
    type: "numeric",
    precision: 14,
    scale: 4,
    default: 0,
  })
  lineTotal!: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;

  @ManyToOne(() => Tenant, { onDelete: "CASCADE" })
  @JoinColumn({ name: "tenant_id" })
  tenant!: Tenant;

  @ManyToOne(() => GoodsReceipt, (gr) => gr.items, { onDelete: "CASCADE" })
  @JoinColumn({ name: "goods_receipt_id" })
  goodsReceipt!: GoodsReceipt;

  @ManyToOne(() => PurchaseOrderItem, {
    onDelete: "SET NULL",
    nullable: true,
  })
  @JoinColumn({ name: "purchase_order_item_id" })
  purchaseOrderItem!: PurchaseOrderItem | null;

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
