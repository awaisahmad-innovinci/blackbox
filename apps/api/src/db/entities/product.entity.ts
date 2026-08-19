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
import { Brand } from "./brand.entity";
import { Category } from "./category.entity";
import { ProductSku } from "./product-sku.entity";
import { Tenant } from "./tenant.entity";

@Entity({ name: "products" })
@Unique("products_tenant_id_product_code_key", ["tenantId", "productCode"])
@Unique("products_tenant_id_import_key_key", ["tenantId", "importKey"])
@Index("products_tenant_id_idx", ["tenantId"])
@Index("products_brand_id_idx", ["brandId"])
@Index("products_category_id_idx", ["categoryId"])
@Index("products_status_idx", ["status"])
export class Product {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "tenant_id", type: "uuid" })
  tenantId!: string;

  @Column({ type: "text" })
  name!: string;

  @Column({ name: "product_code", type: "text" })
  productCode!: string;

  @Column({ name: "import_key", type: "text", nullable: true })
  importKey!: string | null;

  @Column({ name: "brand_id", type: "uuid", nullable: true })
  brandId!: string | null;

  @Column({ name: "category_id", type: "uuid", nullable: true })
  categoryId!: string | null;

  @Column({ name: "product_type", type: "text", default: "STOCK_ITEM" })
  productType!: string;

  @Column({ type: "text", default: "" })
  description!: string;

  @Column({ name: "image_path", type: "text", nullable: true })
  imagePath!: string | null;

  @Column({ type: "text", default: "active" })
  status!: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;

  @ManyToOne(() => Tenant, { onDelete: "CASCADE" })
  @JoinColumn({ name: "tenant_id" })
  tenant!: Tenant;

  @ManyToOne(() => Brand, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "brand_id" })
  brand!: Brand | null;

  @ManyToOne(() => Category, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "category_id" })
  category!: Category | null;

  @OneToMany(() => ProductSku, (sku) => sku.product)
  skus!: ProductSku[];
}
