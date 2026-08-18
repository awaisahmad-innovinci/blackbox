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

@Entity({ name: "inventory_stock" })
@Unique("inventory_stock_tenant_sku_wh_key", [
  "tenantId",
  "productSkuId",
  "warehouseId",
])
@Index("inventory_stock_tenant_id_idx", ["tenantId"])
@Index("inventory_stock_product_sku_id_idx", ["productSkuId"])
@Index("inventory_stock_warehouse_id_idx", ["warehouseId"])
export class InventoryStock {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "tenant_id", type: "uuid" })
  tenantId!: string;

  @Column({ name: "product_sku_id", type: "uuid" })
  productSkuId!: string;

  @Column({ name: "warehouse_id", type: "uuid" })
  warehouseId!: string;

  @Column({
    name: "quantity_on_hand",
    type: "numeric",
    precision: 14,
    scale: 4,
    default: 0,
  })
  quantityOnHand!: string;

  @Column({
    name: "quantity_reserved",
    type: "numeric",
    precision: 14,
    scale: 4,
    default: 0,
  })
  quantityReserved!: string;

  @Column({
    name: "quantity_available",
    type: "numeric",
    precision: 14,
    scale: 4,
    default: 0,
  })
  quantityAvailable!: string;

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

  @ManyToOne(() => Warehouse, { onDelete: "CASCADE" })
  @JoinColumn({ name: "warehouse_id" })
  warehouse!: Warehouse;
}
