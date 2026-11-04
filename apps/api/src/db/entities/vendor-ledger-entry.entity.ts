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
import { Tenant } from "./tenant.entity";
import { Vendor } from "./vendor.entity";

@Entity({ name: "vendor_ledger_entries" })
@Index("vendor_ledger_entries_tenant_vendor_idx", ["tenantId", "vendorId"])
@Index("vendor_ledger_entries_goods_receipt_id_idx", ["goodsReceiptId"])
export class VendorLedgerEntry {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "tenant_id", type: "uuid" })
  tenantId!: string;

  @Column({ name: "vendor_id", type: "uuid" })
  vendorId!: string;

  @Column({ name: "entry_type", type: "text" })
  entryType!: string;

  @Column({ type: "numeric", precision: 14, scale: 4 })
  amount!: string;

  @Column({ name: "goods_receipt_id", type: "uuid", nullable: true })
  goodsReceiptId!: string | null;

  @Column({ name: "receipt_number", type: "text", nullable: true })
  receiptNumber!: string | null;

  @Column({ type: "text", default: "" })
  note!: string;

  @Column({ name: "occurred_at", type: "timestamptz" })
  occurredAt!: Date;

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

  @ManyToOne(() => GoodsReceipt, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "goods_receipt_id" })
  goodsReceipt!: GoodsReceipt | null;
}
