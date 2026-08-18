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
import { InventoryOut } from "./inventory-out.entity";
import { ProductSku } from "./product-sku.entity";
import { Tenant } from "./tenant.entity";

@Entity({ name: "inventory_out_items" })
@Index("inventory_out_items_tenant_id_idx", ["tenantId"])
@Index("inventory_out_items_out_id_idx", ["inventoryOutId"])
@Index("inventory_out_items_product_sku_id_idx", ["productSkuId"])
export class InventoryOutItem {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "tenant_id", type: "uuid" })
  tenantId!: string;

  @Column({ name: "inventory_out_id", type: "uuid" })
  inventoryOutId!: string;

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

  @ManyToOne(() => InventoryOut, (out) => out.items, { onDelete: "CASCADE" })
  @JoinColumn({ name: "inventory_out_id" })
  inventoryOut!: InventoryOut;

  @ManyToOne(() => ProductSku, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "product_sku_id" })
  productSku!: ProductSku;
}
