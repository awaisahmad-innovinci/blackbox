import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { ENTITY_STATUSES } from "@blackbox/shared";

export class ListTaxonomyQueryDto {
  @IsOptional()
  @IsIn([...ENTITY_STATUSES, "all"])
  status?: "active" | "inactive" | "all";

  @IsOptional()
  @IsString()
  q?: string;
}

export class CreateBrandDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsIn([...ENTITY_STATUSES])
  status?: "active" | "inactive";
}

export class UpdateBrandDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsIn([...ENTITY_STATUSES])
  status?: "active" | "inactive";
}

export class CreateCategoryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsIn([...ENTITY_STATUSES])
  status?: "active" | "inactive";
}

export class UpdateCategoryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsIn([...ENTITY_STATUSES])
  status?: "active" | "inactive";
}

export class CreateVendorGroupDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsIn([...ENTITY_STATUSES])
  status?: "active" | "inactive";
}

export class UpdateVendorGroupDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsIn([...ENTITY_STATUSES])
  status?: "active" | "inactive";
}
