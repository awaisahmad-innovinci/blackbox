import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";
import { ENTITY_STATUSES } from "@blackbox/shared";

export class ListWarehousesQueryDto {
  @IsOptional()
  @IsIn([...ENTITY_STATUSES, "all"])
  status?: "active" | "inactive" | "all";

  @IsOptional()
  @IsString()
  q?: string;
}

export class CreateWarehouseDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  code!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  location?: string | null;

  @IsOptional()
  @IsIn([...ENTITY_STATUSES])
  status?: "active" | "inactive";
}

export class UpdateWarehouseDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  code!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  location?: string | null;

  @IsOptional()
  @IsIn([...ENTITY_STATUSES])
  status?: "active" | "inactive";
}
