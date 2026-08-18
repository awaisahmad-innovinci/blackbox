import { Type } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  ValidateIf,
} from "class-validator";
import { ENTITY_STATUSES, PRODUCT_TYPES } from "@blackbox/shared";

export class ListProductsQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @ValidateIf((_, v) => v != null && v !== "")
  @IsUUID()
  brandId?: string;

  @IsOptional()
  @ValidateIf((_, v) => v != null && v !== "")
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsIn(ENTITY_STATUSES)
  status?: (typeof ENTITY_STATUSES)[number];

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

export class CreateProductDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsUUID()
  brandId!: string;

  @IsUUID()
  categoryId!: string;

  @IsOptional()
  @IsIn(PRODUCT_TYPES)
  productType?: (typeof PRODUCT_TYPES)[number];

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(ENTITY_STATUSES)
  status?: (typeof ENTITY_STATUSES)[number];
}

export class UpdateProductDto extends CreateProductDto {}

export class CreateProductSkuDto {
  @IsString()
  @MinLength(1)
  variantName!: string;

  @IsString()
  @MinLength(1)
  sku!: string;

  @IsOptional()
  @IsString()
  barcode?: string | null;

  @IsOptional()
  @IsString()
  sizeValue?: string | null;

  @IsOptional()
  @IsString()
  sizeUnit?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v != null && v !== "")
  @IsUUID()
  baseUnitId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v != null && v !== "")
  @IsUUID()
  purchaseUnitId?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitsPerPurchaseUnit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  costPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sellingPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  reorderLevel?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minimumStockLevel?: number;

  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maximumStockLevel?: number | null;

  @IsOptional()
  @IsBoolean()
  trackInventory?: boolean;

  @IsOptional()
  @IsIn(ENTITY_STATUSES)
  status?: (typeof ENTITY_STATUSES)[number];
}

export class UpdateProductSkuDto extends CreateProductSkuDto {}
