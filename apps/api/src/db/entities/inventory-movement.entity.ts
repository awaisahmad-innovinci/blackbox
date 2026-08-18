import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { ProductSku } from "./product-sku.entity";
import { Tenant } from "./tenant.entity";
import { Warehouse } from "./warehouse.entity";

@Entity({ name: "inventory_movements" })
@Index("inventory_movements_tenant_id_idx", ["tenantId"])
@Index("inventory_movements_product_sku_id_idx", ["productSkuId"])
@Index("inventory_movements_warehouse_id_idx", ["warehouseId"])
@Index("inventory_movements_created_at_idx", ["createdAt"])
export class InventoryMovement {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "tenant_id", type: "uuid" })
  tenantId!: string;

  @Column({ name: "product_sku_id", type: "uuid" })
  productSkuId!: string;

  @Column({ name: "warehouse_id", type: "uuid" })
  warehouseId!: string;

  @Column({ name: "movement_type", type: "text" })
  movementType!: string;

  @Column({ type: "numeric", precision: 14, scale: 4 })
  quantity!: string;

  @Column({ name: "reference_type", type: "text", nullable: true })
  referenceType!: string | null;

  @Column({ name: "reference_id", type: "uuid", nullable: true })
  referenceId!: string | null;

  @Column({ type: "text", default: "" })
  reason!: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

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
