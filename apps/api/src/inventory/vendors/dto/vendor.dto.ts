import { Type } from "class-transformer";
import {
  IsEmail,
  IsDefined,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { ENTITY_STATUSES, PAYMENT_TERMS } from "@blackbox/shared";

export class VendorContactInputDto {
  @IsOptional()
  @IsString()
  name?: string | null;

  @IsOptional()
  @IsString()
  phone?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v != null && String(v).trim() !== "")
  @IsEmail()
  email?: string | null;
}

export class RequiredVendorContactInputDto {
  @IsString()
  @MinLength(1, { message: "contact name is required" })
  name!: string;

  @IsString()
  @MinLength(1, { message: "contact phone is required" })
  phone!: string;

  @IsOptional()
  @ValidateIf((_, v) => v != null && String(v).trim() !== "")
  @IsEmail()
  email?: string | null;
}

export class CreateVendorDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  vendorCode!: string;

  @IsOptional()
  @ValidateIf((_, v) => v != null && v !== "")
  @IsUUID()
  groupId?: string | null;

  @IsOptional()
  @IsIn(ENTITY_STATUSES)
  status?: (typeof ENTITY_STATUSES)[number];

  @IsDefined({ message: "Primary contact is required" })
  @ValidateNested()
  @Type(() => RequiredVendorContactInputDto)
  primaryContact!: RequiredVendorContactInputDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => VendorContactInputDto)
  otherContact?: VendorContactInputDto;

  @IsDefined({ message: "Manager contact is required" })
  @ValidateNested()
  @Type(() => RequiredVendorContactInputDto)
  managerContact!: RequiredVendorContactInputDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => VendorContactInputDto)
  salespersonContact?: VendorContactInputDto;

  @IsOptional()
  @IsString()
  address?: string | null;

  @IsOptional()
  @IsString()
  city?: string | null;

  @IsOptional()
  @IsString()
  state?: string | null;

  @IsOptional()
  @IsString()
  country?: string | null;

  @IsOptional()
  @IsString()
  postalCode?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  salesTarget?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  creditLimit?: number | null;

  @IsOptional()
  @IsIn(PAYMENT_TERMS)
  paymentTerms?: (typeof PAYMENT_TERMS)[number] | null;

  @IsOptional()
  @IsString()
  taxNumber?: string | null;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateVendorDto extends CreateVendorDto {}

export class ListVendorsQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(ENTITY_STATUSES)
  status?: (typeof ENTITY_STATUSES)[number];

  @IsOptional()
  @IsUUID()
  groupId?: string;

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
