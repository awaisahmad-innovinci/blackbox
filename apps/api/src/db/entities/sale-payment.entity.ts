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
import { Sale } from "./sale.entity";
import { Tenant } from "./tenant.entity";

@Entity({ name: "sale_payments" })
@Index("sale_payments_tenant_id_idx", ["tenantId"])
@Index("sale_payments_sale_id_idx", ["saleId"])
export class SalePayment {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "tenant_id", type: "uuid" })
  tenantId!: string;

  @Column({ name: "sale_id", type: "uuid" })
  saleId!: string;

  @Column({ type: "text" })
  method!: string;

  @Column({ type: "numeric", precision: 14, scale: 4 })
  amount!: string;

  @Column({ type: "text", default: "" })
  reference!: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;

  @ManyToOne(() => Tenant, { onDelete: "CASCADE" })
  @JoinColumn({ name: "tenant_id" })
  tenant!: Tenant;

  @ManyToOne(() => Sale, (sale) => sale.payments, { onDelete: "CASCADE" })
  @JoinColumn({ name: "sale_id" })
  sale!: Sale;
}
