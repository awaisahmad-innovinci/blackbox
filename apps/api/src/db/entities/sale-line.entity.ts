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
import { Sale } from "./sale.entity";
import { Tenant } from "./tenant.entity";

@Entity({ name: "sale_lines" })
@Index("sale_lines_tenant_id_idx", ["tenantId"])
@Index("sale_lines_sale_id_idx", ["saleId"])
@Index("sale_lines_product_sku_id_idx", ["productSkuId"])
export class SaleLine {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "tenant_id", type: "uuid" })
  tenantId!: string;

  @Column({ name: "sale_id", type: "uuid" })
  saleId!: string;

  @Column({ name: "product_sku_id", type: "uuid" })
  productSkuId!: string;

  @Column({ type: "numeric", precision: 14, scale: 4 })
  quantity!: string;

  @Column({ name: "unit_price", type: "numeric", precision: 14, scale: 4, default: 0 })
  unitPrice!: string;

  @Column({ name: "line_total", type: "numeric", precision: 14, scale: 4, default: 0 })
  lineTotal!: string;

  @Column({ name: "sell_unit", type: "text", default: "pc" })
  sellUnit!: string;

  @Column({ type: "text", nullable: true })
  barcode!: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;

  @ManyToOne(() => Tenant, { onDelete: "CASCADE" })
  @JoinColumn({ name: "tenant_id" })
  tenant!: Tenant;

  @ManyToOne(() => Sale, (sale) => sale.lines, { onDelete: "CASCADE" })
  @JoinColumn({ name: "sale_id" })
  sale!: Sale;

  @ManyToOne(() => ProductSku, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "product_sku_id" })
  productSku!: ProductSku;
}
