import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";
import { Device } from "./device.entity";
import { Tenant } from "./tenant.entity";
import { User } from "./user.entity";

@Entity({ name: "refresh_tokens" })
@Unique("refresh_tokens_token_hash_key", ["tokenHash"])
@Index("refresh_tokens_user_id_idx", ["userId"])
@Index("refresh_tokens_tenant_id_idx", ["tenantId"])
@Index("refresh_tokens_device_id_idx", ["deviceId"])
@Index("refresh_tokens_expires_at_idx", ["expiresAt"])
export class RefreshToken {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "user_id", type: "uuid" })
  userId!: string;

  @Column({ name: "tenant_id", type: "uuid" })
  tenantId!: string;

  @Column({ name: "device_id", type: "uuid", nullable: true })
  deviceId!: string | null;

  @Column({ name: "token_hash", type: "text" })
  tokenHash!: string;

  @Column({ name: "expires_at", type: "timestamptz" })
  expiresAt!: Date;

  @Column({ name: "revoked_at", type: "timestamptz", nullable: true })
  revokedAt!: Date | null;

  @Column({ name: "replaced_by", type: "uuid", nullable: true })
  replacedBy!: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @ManyToOne(() => User, (user) => user.refreshTokens, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: User;

  @ManyToOne(() => Tenant, { onDelete: "CASCADE" })
  @JoinColumn({ name: "tenant_id" })
  tenant!: Tenant;

  @ManyToOne(() => Device, (device) => device.refreshTokens, {
    onDelete: "SET NULL",
    nullable: true,
  })
  @JoinColumn({ name: "device_id" })
  device!: Device | null;

  @ManyToOne(() => RefreshToken, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "replaced_by" })
  replacedByToken!: RefreshToken | null;
}
