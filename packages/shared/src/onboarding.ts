/** Allowed business types collected during web onboarding. */
export const BUSINESS_TYPES = ["RETAIL_LIGHT", "HYPER_MART"] as const;

export type BusinessType = (typeof BUSINESS_TYPES)[number];

export const BUSINESS_TYPE_LABELS: Record<BusinessType, string> = {
  RETAIL_LIGHT: "Retail Light",
  HYPER_MART: "Hyper Mart",
};

export function isBusinessType(value: string): value is BusinessType {
  return (BUSINESS_TYPES as readonly string[]).includes(value);
}

/** Curated country list for Phase 1 onboarding. */
export const COUNTRIES = [
  { code: "PK", name: "Pakistan" },
  { code: "US", name: "United States" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "GB", name: "United Kingdom" },
] as const;

export type CountryCode = (typeof COUNTRIES)[number]["code"];

export const COUNTRY_CODES = COUNTRIES.map((c) => c.code) as [
  CountryCode,
  ...CountryCode[],
];

export function isCountryCode(value: string): value is CountryCode {
  return (COUNTRY_CODES as readonly string[]).includes(value);
}

/** Curated currency list for Phase 1 onboarding. */
export const CURRENCIES = [
  { code: "PKR", name: "Pakistani Rupee" },
  { code: "USD", name: "US Dollar" },
  { code: "AED", name: "UAE Dirham" },
  { code: "GBP", name: "British Pound" },
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number]["code"];

export const CURRENCY_CODES = CURRENCIES.map((c) => c.code) as [
  CurrencyCode,
  ...CurrencyCode[],
];

export function isCurrencyCode(value: string): value is CurrencyCode {
  return (CURRENCY_CODES as readonly string[]).includes(value);
}

/** Suggested default currency for a country (UI convenience only). */
export const DEFAULT_CURRENCY_BY_COUNTRY: Record<CountryCode, CurrencyCode> = {
  PK: "PKR",
  US: "USD",
  AE: "AED",
  GB: "GBP",
};

export interface OnboardingBusinessRequest {
  businessType: BusinessType;
  country: CountryCode;
  currency: CurrencyCode;
}

export interface OnboardingLocationRequest {
  name: string;
  city: string;
  address?: string;
}
