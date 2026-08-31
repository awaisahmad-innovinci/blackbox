import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from "class-validator";

export class CreateGoodsReceiptItemDto {
  @IsUUID()
  purchaseOrderItemId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  receivedQuantity!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  bonusQuantity?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  receivingUnitCost!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  discountPercent?: number;
}

export class CreateGoodsReceiptDto {
  @IsOptional()
  @IsDateString()
  receiptDate?: string;

  @IsOptional()
  @IsString()
  voucherNumber?: string | null;

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
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateGoodsReceiptItemDto)
  items!: CreateGoodsReceiptItemDto[];
}
