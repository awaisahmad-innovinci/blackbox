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
import { SaleLine } from "./sale-line.entity";
import { SaleReturn } from "./sale-return.entity";
import { Tenant } from "./tenant.entity";

@Entity({ name: "sale_return_lines" })
@Index("sale_return_lines_tenant_id_idx", ["tenantId"])
@Index("sale_return_lines_return_id_idx", ["saleReturnId"])
@Index("sale_return_lines_sale_line_id_idx", ["saleLineId"])
@Index("sale_return_lines_product_sku_id_idx", ["productSkuId"])
export class SaleReturnLine {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "tenant_id", type: "uuid" })
  tenantId!: string;

  @Column({ name: "sale_return_id", type: "uuid" })
  saleReturnId!: string;

  @Column({ name: "sale_line_id", type: "uuid" })
  saleLineId!: string;

  @Column({ name: "product_sku_id", type: "uuid" })
  productSkuId!: string;

  @Column({ type: "numeric", precision: 14, scale: 4 })
  quantity!: string;

  @Column({ name: "unit_price", type: "numeric", precision: 14, scale: 4, default: 0 })
  unitPrice!: string;

  @Column({
    name: "discount_percent",
    type: "numeric",
    precision: 8,
    scale: 4,
    default: 0,
  })
  discountPercent!: string;

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

  @ManyToOne(() => SaleReturn, (ret) => ret.lines, { onDelete: "CASCADE" })
  @JoinColumn({ name: "sale_return_id" })
  saleReturn!: SaleReturn;

  @ManyToOne(() => SaleLine, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "sale_line_id" })
  saleLine!: SaleLine;

  @ManyToOne(() => ProductSku, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "product_sku_id" })
  productSku!: ProductSku;
}
