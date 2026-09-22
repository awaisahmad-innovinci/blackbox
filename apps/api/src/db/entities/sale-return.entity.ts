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
import { SaleReturnLine } from "./sale-return-line.entity";
import { Sale } from "./sale.entity";
import { Tenant } from "./tenant.entity";
import { User } from "./user.entity";
import { Warehouse } from "./warehouse.entity";

@Entity({ name: "sale_returns" })
@Unique("sale_returns_tenant_return_number_key", ["tenantId", "returnNumber"])
@Index("sale_returns_tenant_id_idx", ["tenantId"])
@Index("sale_returns_sale_id_idx", ["saleId"])
@Index("sale_returns_warehouse_id_idx", ["warehouseId"])
@Index("sale_returns_return_date_idx", ["returnDate"])
export class SaleReturn {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "tenant_id", type: "uuid" })
  tenantId!: string;

  @Column({ name: "return_number", type: "text" })
  returnNumber!: string;

  @Column({ name: "sale_id", type: "uuid" })
  saleId!: string;

  @Column({ name: "warehouse_id", type: "uuid" })
  warehouseId!: string;

  @Column({ name: "return_date", type: "date" })
  returnDate!: string;

  @Column({ type: "text", default: "PENDING" })
  status!: string;

  @Column({ type: "numeric", precision: 14, scale: 4, default: 0 })
  subtotal!: string;

  @Column({ name: "gst_rate", type: "numeric", precision: 8, scale: 4, default: 0 })
  gstRate!: string;

  @Column({ name: "gst_amount", type: "numeric", precision: 14, scale: 4, default: 0 })
  gstAmount!: string;

  @Column({
    name: "sales_tax_rate",
    type: "numeric",
    precision: 8,
    scale: 4,
    default: 0,
  })
  salesTaxRate!: string;

  @Column({
    name: "sales_tax_amount",
    type: "numeric",
    precision: 14,
    scale: 4,
    default: 0,
  })
  salesTaxAmount!: string;

  @Column({ name: "refund_total", type: "numeric", precision: 14, scale: 4, default: 0 })
  refundTotal!: string;

  @Column({ name: "refund_method", type: "text", default: "CASH" })
  refundMethod!: string;

  @Column({ type: "text", default: "" })
  notes!: string;

  @Column({ name: "processed_by", type: "uuid", nullable: true })
  processedBy!: string | null;

  @Column({ name: "issued_by", type: "uuid", nullable: true })
  issuedBy!: string | null;

  @Column({ name: "issued_by_name", type: "text", nullable: true })
  issuedByName!: string | null;

  @Column({ name: "refunded_by", type: "uuid", nullable: true })
  refundedBy!: string | null;

  @Column({ name: "refunded_by_name", type: "text", nullable: true })
  refundedByName!: string | null;

  @Column({ name: "refunded_at", type: "timestamptz", nullable: true })
  refundedAt!: Date | null;

  @Column({ name: "applied_to_sale_id", type: "uuid", nullable: true })
  appliedToSaleId!: string | null;

  @Column({ name: "completion_mode", type: "text", nullable: true })
  completionMode!: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;

  @ManyToOne(() => Tenant, { onDelete: "CASCADE" })
  @JoinColumn({ name: "tenant_id" })
  tenant!: Tenant;

  @ManyToOne(() => Sale, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "sale_id" })
  sale!: Sale;

  @ManyToOne(() => Warehouse, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "warehouse_id" })
  warehouse!: Warehouse;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "processed_by" })
  processedByUser!: User | null;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "issued_by" })
  issuedByUser!: User | null;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "refunded_by" })
  refundedByUser!: User | null;

  @ManyToOne(() => Sale, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "applied_to_sale_id" })
  appliedToSale!: Sale | null;

  @OneToMany(() => SaleReturnLine, (line) => line.saleReturn)
  lines!: SaleReturnLine[];
}
