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
import { Product } from "./product.entity";
import { Tenant } from "./tenant.entity";
import { Unit } from "./unit.entity";

@Entity({ name: "product_skus" })
@Unique("product_skus_tenant_id_sku_key", ["tenantId", "sku"])
@Unique("product_skus_tenant_id_barcode_key", ["tenantId", "barcode"])
@Index("product_skus_tenant_id_idx", ["tenantId"])
@Index("product_skus_product_id_idx", ["productId"])
@Index("product_skus_sku_idx", ["sku"])
export class ProductSku {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "tenant_id", type: "uuid" })
  tenantId!: string;

  @Column({ name: "product_id", type: "uuid" })
  productId!: string;

  @Column({ type: "text" })
  sku!: string;

  @Column({ type: "text", nullable: true })
  barcode!: string | null;

  @Column({ name: "variant_name", type: "text", default: "" })
  variantName!: string;

  @Column({ name: "size_value", type: "text", nullable: true })
  sizeValue!: string | null;

  @Column({ name: "size_unit", type: "text", nullable: true })
  sizeUnit!: string | null;

  @Column({ name: "base_unit_id", type: "uuid", nullable: true })
  baseUnitId!: string | null;

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
    name: "cost_price",
    type: "numeric",
    precision: 14,
    scale: 4,
    default: 0,
  })
  costPrice!: string;

  @Column({
    name: "selling_price",
    type: "numeric",
    precision: 14,
    scale: 4,
    default: 0,
  })
  sellingPrice!: string;

  @Column({
    name: "reorder_level",
    type: "numeric",
    precision: 14,
    scale: 4,
    default: 0,
  })
  reorderLevel!: string;

  @Column({
    name: "minimum_stock_level",
    type: "numeric",
    precision: 14,
    scale: 4,
    default: 0,
  })
  minimumStockLevel!: string;

  @Column({
    name: "maximum_stock_level",
    type: "numeric",
    precision: 14,
    scale: 4,
    nullable: true,
  })
  maximumStockLevel!: string | null;

  @Column({ name: "track_inventory", type: "boolean", default: true })
  trackInventory!: boolean;

  @Column({ type: "text", default: "active" })
  status!: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;

  @ManyToOne(() => Tenant, { onDelete: "CASCADE" })
  @JoinColumn({ name: "tenant_id" })
  tenant!: Tenant;

  @ManyToOne(() => Product, (product) => product.skus, { onDelete: "CASCADE" })
  @JoinColumn({ name: "product_id" })
  product!: Product;

  @ManyToOne(() => Unit, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "base_unit_id" })
  baseUnit!: Unit | null;

  @ManyToOne(() => Unit, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "purchase_unit_id" })
  purchaseUnit!: Unit | null;
}
