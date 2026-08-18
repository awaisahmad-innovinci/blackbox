import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { PURCHASE_ORDER_STATUSES } from "@blackbox/shared";

export class ListPurchaseOrdersQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @ValidateIf((_, v) => v != null && v !== "")
  @IsUUID()
  vendorId?: string;

  @IsOptional()
  @ValidateIf((_, v) => v != null && v !== "")
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsIn(PURCHASE_ORDER_STATUSES)
  status?: (typeof PURCHASE_ORDER_STATUSES)[number];

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

export class PurchaseOrderItemInputDto {
  @IsUUID()
  productSkuId!: string;

  @IsUUID()
  vendorSkuId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  quantity!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitCost!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  tax?: number;
}

export class CreatePurchaseOrderDto {
  @IsUUID()
  vendorId!: string;

  @IsUUID()
  warehouseId!: string;

  @IsOptional()
  @IsDateString()
  orderDate?: string;

  @IsOptional()
  @ValidateIf((_, v) => v != null && v !== "")
  @IsDateString()
  expectedDate?: string | null;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  tax?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  otherCharges?: number;

  @IsArray()
  @ArrayMinSize(0)
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderItemInputDto)
  items!: PurchaseOrderItemInputDto[];

  @IsOptional()
  @IsBoolean()
  submit?: boolean;
}

export class UpdatePurchaseOrderDto extends CreatePurchaseOrderDto {}

export class UpdatePurchaseOrderItemPriceDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitCost!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sellingPrice!: number;
}
