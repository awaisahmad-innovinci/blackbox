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
import { Warehouse } from "./warehouse.entity";

/** Net quantity currently out at POS / front store per warehouse + SKU. */
@Entity({ name: "inventory_out_items" })
@Unique("inventory_out_items_tenant_wh_sku_key", [
  "tenantId",
  "warehouseId",
  "productSkuId",
])
@Index("inventory_out_items_tenant_id_idx", ["tenantId"])
@Index("inventory_out_items_warehouse_id_idx", ["warehouseId"])
@Index("inventory_out_items_product_sku_id_idx", ["productSkuId"])
export class InventoryOutItem {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "tenant_id", type: "uuid" })
  tenantId!: string;

  @Column({ name: "warehouse_id", type: "uuid" })
  warehouseId!: string;

  @Column({ name: "product_sku_id", type: "uuid" })
  productSkuId!: string;

  @Column({ type: "numeric", precision: 14, scale: 4 })
  quantity!: string;

  @Column({
    name: "unit_cost",
    type: "numeric",
    precision: 14,
    scale: 4,
    default: 0,
  })
  unitCost!: string;

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

  @ManyToOne(() => ProductSku, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "product_sku_id" })
  productSku!: ProductSku;
}
