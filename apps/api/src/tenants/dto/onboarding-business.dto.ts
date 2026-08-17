import { IsIn, IsString } from "class-validator";
import {
  BUSINESS_TYPES,
  COUNTRY_CODES,
  CURRENCY_CODES,
} from "@blackbox/shared";

export class OnboardingBusinessDto {
  @IsString()
  @IsIn([...BUSINESS_TYPES])
  businessType!: (typeof BUSINESS_TYPES)[number];

  @IsString()
  @IsIn([...COUNTRY_CODES])
  country!: (typeof COUNTRY_CODES)[number];

  @IsString()
  @IsIn([...CURRENCY_CODES])
  currency!: (typeof CURRENCY_CODES)[number];
}
