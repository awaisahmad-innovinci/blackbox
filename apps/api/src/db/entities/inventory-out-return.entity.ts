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
import { InventoryOut } from "./inventory-out.entity";
import { InventoryOutReturnItem } from "./inventory-out-return-item.entity";
import { Tenant } from "./tenant.entity";
import { Warehouse } from "./warehouse.entity";

@Entity({ name: "inventory_out_returns" })
@Unique("inventory_out_returns_tenant_return_number_key", [
  "tenantId",
  "returnNumber",
])
@Index("inventory_out_returns_tenant_id_idx", ["tenantId"])
@Index("inventory_out_returns_inventory_out_id_idx", ["inventoryOutId"])
@Index("inventory_out_returns_warehouse_id_idx", ["warehouseId"])
export class InventoryOutReturn {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "tenant_id", type: "uuid" })
  tenantId!: string;

  @Column({ name: "return_number", type: "text" })
  returnNumber!: string;

  @Column({ name: "inventory_out_id", type: "uuid" })
  inventoryOutId!: string;

  @Column({ name: "warehouse_id", type: "uuid" })
  warehouseId!: string;

  @Column({ name: "return_date", type: "date" })
  returnDate!: string;

  @Column({ type: "text", default: "" })
  notes!: string;

  @Column({ type: "text", default: "POSTED" })
  status!: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;

  @ManyToOne(() => Tenant, { onDelete: "CASCADE" })
  @JoinColumn({ name: "tenant_id" })
  tenant!: Tenant;

  @ManyToOne(() => InventoryOut, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "inventory_out_id" })
  inventoryOut!: InventoryOut;

  @ManyToOne(() => Warehouse, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "warehouse_id" })
  warehouse!: Warehouse;

  @OneToMany(() => InventoryOutReturnItem, (item) => item.inventoryOutReturn)
  items!: InventoryOutReturnItem[];
}
