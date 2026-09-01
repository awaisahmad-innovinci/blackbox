import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from "class-validator";
import {
  VENDOR_RETURN_REASONS,
  VENDOR_RETURN_STATUSES,
} from "@blackbox/shared";

export class CreateVendorReturnItemDto {
  @IsUUID()
  productSkuId!: string;

  @IsOptional()
  @IsUUID()
  vendorSkuId?: string | null;

  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  quantity!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitCost!: number;

  @IsIn(VENDOR_RETURN_REASONS)
  reason!: (typeof VENDOR_RETURN_REASONS)[number];
}

export class CreateVendorReturnDto {
  @IsUUID()
  vendorId!: string;

  @IsUUID()
  warehouseId!: string;

  @IsOptional()
  @IsDateString()
  returnDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateVendorReturnItemDto)
  items!: CreateVendorReturnItemDto[];
}

export class ListVendorReturnsQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsUUID()
  vendorId?: string;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsIn(VENDOR_RETURN_STATUSES)
  status?: (typeof VENDOR_RETURN_STATUSES)[number];

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  pageSize?: number;
}

export class LastPurchaseCostQueryDto {
  @IsUUID()
  vendorId!: string;

  @IsUUID()
  productSkuId!: string;
}

export class PendingVendorReturnsQueryDto {
  @IsUUID()
  vendorId!: string;
}
