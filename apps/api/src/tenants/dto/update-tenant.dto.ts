import { IsBoolean, IsOptional, IsString, MinLength } from "class-validator";

export class UpdateTenantDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsBoolean()
  requireManagerApprovalRemoveSaleLine?: boolean;

  @IsOptional()
  @IsBoolean()
  requireManagerApprovalTillOpen?: boolean;

  @IsOptional()
  @IsBoolean()
  requireManagerApprovalTillWithdraw?: boolean;
}
