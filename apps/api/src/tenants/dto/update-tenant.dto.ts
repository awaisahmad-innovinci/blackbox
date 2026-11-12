import { Type } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  ValidateIf,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { FBR_ENVIRONMENTS, FBR_PROVINCES } from "@blackbox/shared";

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

  @IsOptional()
  @IsBoolean()
  requireManagerApprovalFoc?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  defaultGstRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  defaultSalesTaxRate?: number;

  @IsOptional()
  @IsBoolean()
  fbrEnabled?: boolean;

  @IsOptional()
  @IsIn(FBR_ENVIRONMENTS)
  fbrEnvironment?: (typeof FBR_ENVIRONMENTS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  fbrToken?: string;

  @IsOptional()
  @ValidateIf((_, value) => value != null && String(value).trim() !== "")
  @IsString()
  @Matches(/^(\d{7}|\d{9}|\d{13})$/, {
    message: "Seller NTN must be 7, 9, or 13 digits",
  })
  fbrSellerNtn?: string;

  @IsOptional()
  @ValidateIf((_, value) => value != null && String(value).trim() !== "")
  @IsIn(FBR_PROVINCES)
  fbrSellerProvince?: (typeof FBR_PROVINCES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  fbrSellerAddress?: string;

  @IsOptional()
  @ValidateIf((_, value) => value != null && String(value).trim() !== "")
  @IsString()
  @Matches(/^SN\d{3}$/, { message: "Scenario id must look like SN026" })
  fbrScenarioId?: string;
}
