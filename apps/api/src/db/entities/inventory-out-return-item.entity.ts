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
import { InventoryOutItem } from "./inventory-out-item.entity";
import { InventoryOutReturn } from "./inventory-out-return.entity";
import { ProductSku } from "./product-sku.entity";
import { Tenant } from "./tenant.entity";

@Entity({ name: "inventory_out_return_items" })
@Index("inventory_out_return_items_tenant_id_idx", ["tenantId"])
@Index("inventory_out_return_items_return_id_idx", ["inventoryOutReturnId"])
@Index("inventory_out_return_items_product_sku_id_idx", ["productSkuId"])
export class InventoryOutReturnItem {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "tenant_id", type: "uuid" })
  tenantId!: string;

  @Column({ name: "inventory_out_return_id", type: "uuid" })
  inventoryOutReturnId!: string;

  @Column({ name: "product_sku_id", type: "uuid" })
  productSkuId!: string;

  @Column({ name: "inventory_out_item_id", type: "uuid", nullable: true })
  inventoryOutItemId!: string | null;

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

  @ManyToOne(() => InventoryOutReturn, (ret) => ret.items, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "inventory_out_return_id" })
  inventoryOutReturn!: InventoryOutReturn;

  @ManyToOne(() => ProductSku, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "product_sku_id" })
  productSku!: ProductSku;

  @ManyToOne(() => InventoryOutItem, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "inventory_out_item_id" })
  inventoryOutItem!: InventoryOutItem | null;
}
