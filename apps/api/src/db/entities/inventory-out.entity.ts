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
import { InventoryOutItem } from "./inventory-out-item.entity";
import { Tenant } from "./tenant.entity";
import { Warehouse } from "./warehouse.entity";

@Entity({ name: "inventory_outs" })
@Unique("inventory_outs_tenant_out_number_key", ["tenantId", "outNumber"])
@Index("inventory_outs_tenant_id_idx", ["tenantId"])
@Index("inventory_outs_warehouse_id_idx", ["warehouseId"])
export class InventoryOut {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "tenant_id", type: "uuid" })
  tenantId!: string;

  @Column({ name: "out_number", type: "text" })
  outNumber!: string;

  @Column({ name: "warehouse_id", type: "uuid" })
  warehouseId!: string;

  @Column({ name: "out_date", type: "date" })
  outDate!: string;

  @Column({ type: "text", nullable: true })
  reference!: string | null;

  @Column({ type: "text", default: "" })
  notes!: string;

  @Column({ type: "text", default: "POSTED" })
  status!: string;

  @Column({ type: "numeric", precision: 14, scale: 4, default: 0 })
  subtotal!: string;

  @Column({ type: "numeric", precision: 14, scale: 4, default: 0 })
  total!: string;

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

  @OneToMany(() => InventoryOutItem, (item) => item.inventoryOut)
  items!: InventoryOutItem[];
}
