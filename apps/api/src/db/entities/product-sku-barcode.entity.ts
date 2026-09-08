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

@Entity({ name: "product_sku_barcodes" })
@Unique("product_sku_barcodes_tenant_barcode_key", ["tenantId", "barcode"])
@Index("product_sku_barcodes_sku_id_idx", ["productSkuId"])
export class ProductSkuBarcode {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "tenant_id", type: "uuid" })
  tenantId!: string;

  @Column({ name: "product_sku_id", type: "uuid" })
  productSkuId!: string;

  @Column({ type: "text" })
  barcode!: string;

  @Column({
    name: "quantity_multiplier",
    type: "numeric",
    precision: 14,
    scale: 4,
    default: 1,
  })
  quantityMultiplier!: string;

  @Column({ type: "text", default: "active" })
  status!: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;

  @ManyToOne(() => Tenant, { onDelete: "CASCADE" })
  @JoinColumn({ name: "tenant_id" })
  tenant!: Tenant;

  @ManyToOne(() => ProductSku, { onDelete: "CASCADE" })
  @JoinColumn({ name: "product_sku_id" })
  productSku!: ProductSku;
}
