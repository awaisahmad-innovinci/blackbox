import { Type } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from "class-validator";
import { ENTITY_STATUSES } from "@blackbox/shared";

export class CreateVendorSkuDto {
  @IsUUID()
  vendorId!: string;

  @IsUUID()
  productSkuId!: string;

  @IsOptional()
  @IsString()
  vendorSkuCode?: string | null;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  purchasePrice!: number;

  @IsOptional()
  @IsUUID()
  purchaseUnitId?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  unitsPerPurchaseUnit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minimumOrderQuantity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  leadTimeDays?: number;

  @IsOptional()
  @IsBoolean()
  isPreferred?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateVendorSkuDto {
  @IsOptional()
  @IsString()
  vendorSkuCode?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  purchasePrice?: number;

  @IsOptional()
  @IsUUID()
  purchaseUnitId?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  unitsPerPurchaseUnit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minimumOrderQuantity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  leadTimeDays?: number;

  @IsOptional()
  @IsBoolean()
  isPreferred?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsIn(ENTITY_STATUSES)
  status?: (typeof ENTITY_STATUSES)[number];
}
