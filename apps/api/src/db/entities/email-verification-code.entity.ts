import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";

@Entity({ name: "email_verification_codes" })
@Index("email_verification_codes_email_idx", ["email"])
@Index("email_verification_codes_expires_at_idx", ["expiresAt"])
export class EmailVerificationCode {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "text" })
  email!: string;

  @Column({ name: "code_hash", type: "text" })
  codeHash!: string;

  @Column({ name: "expires_at", type: "timestamptz" })
  expiresAt!: Date;

  @Column({ name: "used_at", type: "timestamptz", nullable: true })
  usedAt!: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
