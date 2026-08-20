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

  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsString()
  barcode?: string | null;

  @IsOptional()
  @IsString()
  sizeValue?: string | null;

  @IsOptional()
  @IsString()
  sizeUnit?: string | null;

  @IsUUID()
  baseUnitId!: string;

  @IsUUID()
  purchaseUnitId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  unitsPerPurchaseUnit!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  costPrice!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sellingPrice!: number;

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

export class UpdateProductSkuDto extends CreateProductSkuDto {
  @IsString()
  @MinLength(1)
  sku!: string;
}
