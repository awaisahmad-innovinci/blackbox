import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from "class-validator";

export class CreateInventoryOutItemDto {
  @IsUUID()
  productSkuId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  quantity!: number;
}

export class CreateInventoryOutDto {
  @IsUUID()
  warehouseId!: string;

  @IsOptional()
  @IsDateString()
  outDate?: string;

  @IsOptional()
  @IsString()
  reference?: string | null;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateInventoryOutItemDto)
  items!: CreateInventoryOutItemDto[];
}
