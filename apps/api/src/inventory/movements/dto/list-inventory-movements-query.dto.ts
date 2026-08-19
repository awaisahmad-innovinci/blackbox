import { Type } from "class-transformer";
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsUUID,
  Min,
  ValidateIf,
} from "class-validator";

export class ListInventoryMovementsQueryDto {
  @IsOptional()
  @ValidateIf((_, v) => v != null && v !== "")
  @IsUUID()
  productSkuId?: string;

  @IsOptional()
  @ValidateIf((_, v) => v != null && v !== "")
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsDateString()
  since?: string;

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
