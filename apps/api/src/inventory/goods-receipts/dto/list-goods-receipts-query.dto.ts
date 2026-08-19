import { Type } from "class-transformer";
import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateIf,
} from "class-validator";
import { GOODS_RECEIPT_STATUSES } from "@blackbox/shared";

export class ListGoodsReceiptsQueryDto {
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
  @IsIn(GOODS_RECEIPT_STATUSES)
  status?: (typeof GOODS_RECEIPT_STATUSES)[number];

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
