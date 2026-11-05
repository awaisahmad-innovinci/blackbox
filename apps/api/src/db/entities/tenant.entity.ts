import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { Device } from "./device.entity";
import { Location } from "./location.entity";
import { Role } from "./role.entity";
import { User } from "./user.entity";

@Entity({ name: "tenants" })
export class Tenant {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "text" })
  name!: string;

  @Column({ name: "is_active", type: "boolean", default: true })
  isActive!: boolean;

  /** RETAIL_LIGHT | HYPER_MART — set during onboarding */
  @Column({ name: "business_type", type: "text", nullable: true })
  businessType!: string | null;

  @Column({ type: "text", nullable: true })
  country!: string | null;

  @Column({ type: "text", nullable: true })
  currency!: string | null;

  @Column({ name: "onboarding_completed_at", type: "timestamptz", nullable: true })
  onboardingCompletedAt!: Date | null;

  @Column({
    name: "require_manager_approval_remove_sale_line",
    type: "boolean",
    default: true,
  })
  requireManagerApprovalRemoveSaleLine!: boolean;

  @Column({
    name: "require_manager_approval_till_open",
    type: "boolean",
    default: true,
  })
  requireManagerApprovalTillOpen!: boolean;

  @Column({
    name: "require_manager_approval_till_withdraw",
    type: "boolean",
    default: true,
  })
  requireManagerApprovalTillWithdraw!: boolean;

  @Column({
    name: "require_manager_approval_foc",
    type: "boolean",
    default: true,
  })
  requireManagerApprovalFoc!: boolean;

  /** Percentage applied to every sale subtotal (e.g. 17 = 17%). */
  @Column({ name: "default_gst_rate", type: "real", default: 0 })
  defaultGstRate!: number;

  /** Percentage applied to every sale subtotal after GST. */
  @Column({ name: "default_sales_tax_rate", type: "real", default: 0 })
  defaultSalesTaxRate!: number;

  @Column({ name: "fbr_enabled", type: "boolean", default: false })
  fbrEnabled!: boolean;

  @Column({ name: "fbr_environment", type: "text", default: "sandbox" })
  fbrEnvironment!: string;

  @Column({ name: "fbr_token", type: "text", nullable: true })
  fbrToken!: string | null;

  @Column({ name: "fbr_seller_ntn", type: "text", nullable: true })
  fbrSellerNtn!: string | null;

  @Column({ name: "fbr_seller_province", type: "text", nullable: true })
  fbrSellerProvince!: string | null;

  @Column({ name: "fbr_seller_address", type: "text", nullable: true })
  fbrSellerAddress!: string | null;

  @Column({ name: "fbr_scenario_id", type: "text", default: "SN026" })
  fbrScenarioId!: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;

  @OneToMany(() => User, (user) => user.tenant)
  users!: User[];

  @OneToMany(() => Role, (role) => role.tenant)
  roles!: Role[];

  @OneToMany(() => Device, (device) => device.tenant)
  devices!: Device[];

  @OneToMany(() => Location, (location) => location.tenant)
  locations!: Location[];
}
