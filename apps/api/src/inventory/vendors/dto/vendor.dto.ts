import { Type } from "class-transformer";
import {
  IsEmail,
  IsDefined,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import {
  ENTITY_STATUSES,
  PAYMENT_TERMS,
  PERSON_NAME_MESSAGE,
  PERSON_NAME_PATTERN,
  PHONE_11_DIGIT_MESSAGE,
  PHONE_11_DIGIT_PATTERN,
} from "@blackbox/shared";

export class VendorContactInputDto {
  @IsOptional()
  @ValidateIf((_, v) => v != null && String(v).trim() !== "")
  @IsString()
  @Matches(PERSON_NAME_PATTERN, { message: PERSON_NAME_MESSAGE })
  name?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v != null && String(v).trim() !== "")
  @IsString()
  @Matches(PHONE_11_DIGIT_PATTERN, { message: PHONE_11_DIGIT_MESSAGE })
  phone?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v != null && String(v).trim() !== "")
  @IsEmail()
  email?: string | null;
}

export class RequiredVendorContactInputDto {
  @IsString()
  @Matches(PERSON_NAME_PATTERN, { message: PERSON_NAME_MESSAGE })
  name!: string;

  @IsString()
  @Matches(PHONE_11_DIGIT_PATTERN, { message: PHONE_11_DIGIT_MESSAGE })
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
