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
