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
import { Device } from "./device.entity";
import { SaleLine } from "./sale-line.entity";
import { SalePayment } from "./sale-payment.entity";
import { Tenant } from "./tenant.entity";
import { User } from "./user.entity";
import { Warehouse } from "./warehouse.entity";

@Entity({ name: "sales" })
@Unique("sales_tenant_sale_number_key", ["tenantId", "saleNumber"])
@Index("sales_tenant_id_idx", ["tenantId"])
@Index("sales_warehouse_id_idx", ["warehouseId"])
@Index("sales_posted_at_idx", ["postedAt"])
export class Sale {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "tenant_id", type: "uuid" })
  tenantId!: string;

  @Column({ name: "warehouse_id", type: "uuid" })
  warehouseId!: string;

  @Column({ name: "sale_number", type: "text" })
  saleNumber!: string;

  @Column({ type: "text", default: "POSTED" })
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

  @Column({ type: "numeric", precision: 14, scale: 4, default: 0 })
  total!: string;

  @Column({ name: "device_id", type: "uuid", nullable: true })
  deviceId!: string | null;

  @Column({ name: "posted_by", type: "uuid", nullable: true })
  postedBy!: string | null;

  @Column({ name: "posted_at", type: "timestamptz", nullable: true })
  postedAt!: Date | null;

  @Column({ name: "customer_name", type: "text", default: "CASH SALES CUSTOMER" })
  customerName!: string;

  @Column({ name: "posted_by_name", type: "text", nullable: true })
  postedByName!: string | null;

  @Column({
    name: "cash_tendered",
    type: "numeric",
    precision: 14,
    scale: 4,
    nullable: true,
  })
  cashTendered!: string | null;

  @Column({ type: "text", default: "" })
  notes!: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;

  @ManyToOne(() => Tenant, { onDelete: "CASCADE" })
  @JoinColumn({ name: "tenant_id" })
  tenant!: Tenant;

  @ManyToOne(() => Warehouse, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "warehouse_id" })
  warehouse!: Warehouse;

  @ManyToOne(() => Device, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "device_id" })
  device!: Device | null;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "posted_by" })
  postedByUser!: User | null;

  @OneToMany(() => SaleLine, (line) => line.sale)
  lines!: SaleLine[];

  @OneToMany(() => SalePayment, (payment) => payment.sale)
  payments!: SalePayment[];
}
