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
import { GoodsReceiptItem } from "./goods-receipt-item.entity";
import { PurchaseOrder } from "./purchase-order.entity";
import { Tenant } from "./tenant.entity";
import { Vendor } from "./vendor.entity";
import { Warehouse } from "./warehouse.entity";

@Entity({ name: "goods_receipts" })
@Unique("goods_receipts_tenant_receipt_number_key", [
  "tenantId",
  "receiptNumber",
])
@Index("goods_receipts_tenant_id_idx", ["tenantId"])
@Index("goods_receipts_po_id_idx", ["purchaseOrderId"])
export class GoodsReceipt {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "tenant_id", type: "uuid" })
  tenantId!: string;

  @Column({ name: "receipt_number", type: "text" })
  receiptNumber!: string;

  @Column({ name: "purchase_order_id", type: "uuid" })
  purchaseOrderId!: string;

  @Column({ name: "vendor_id", type: "uuid", nullable: true })
  vendorId!: string | null;

  @Column({ name: "warehouse_id", type: "uuid" })
  warehouseId!: string;

  @Column({ type: "text", default: "DRAFT" })
  status!: string;

  @Column({ name: "received_at", type: "timestamptz", nullable: true })
  receivedAt!: Date | null;

  @Column({ name: "voucher_number", type: "text", nullable: true })
  voucherNumber!: string | null;

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

  @Column({
    name: "adv_tax",
    type: "numeric",
    precision: 14,
    scale: 4,
    default: 0,
  })
  advTax!: string;

  @Column({
    type: "numeric",
    precision: 14,
    scale: 4,
    default: 0,
  })
  gst!: string;

  @Column({
    type: "numeric",
    precision: 14,
    scale: 4,
    default: 0,
  })
  incentive!: string;

  @Column({
    name: "shelf_rent",
    type: "numeric",
    precision: 14,
    scale: 4,
    default: 0,
  })
  shelfRent!: string;

  @Column({
    name: "return_credit",
    type: "numeric",
    precision: 14,
    scale: 4,
    default: 0,
  })
  returnCredit!: string;

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

  @ManyToOne(() => PurchaseOrder, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "purchase_order_id" })
  purchaseOrder!: PurchaseOrder;

  @ManyToOne(() => Vendor, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "vendor_id" })
  vendor!: Vendor | null;

  @ManyToOne(() => Warehouse, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "warehouse_id" })
  warehouse!: Warehouse;

  @OneToMany(() => GoodsReceiptItem, (item) => item.goodsReceipt)
  items!: GoodsReceiptItem[];
}
