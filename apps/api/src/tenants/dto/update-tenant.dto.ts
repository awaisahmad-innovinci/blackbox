import { Type } from "class-transformer";
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from "class-validator";

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
}
