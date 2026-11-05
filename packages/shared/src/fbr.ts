export const HS_CODE_PATTERN = /^\d{4}\.\d{4}$/;

export const FBR_ENVIRONMENTS = ["sandbox", "production"] as const;
export type FbrEnvironment = (typeof FBR_ENVIRONMENTS)[number];

export const FBR_INVOICE_STATUSES = [
  "pending",
  "submitted",
  "failed",
  "excluded",
] as const;
export type FbrInvoiceStatus = (typeof FBR_INVOICE_STATUSES)[number];

/** Simple bills use `excluded` and are never sent to FBR. */
export function asFbrInvoiceStatus(value: unknown): FbrInvoiceStatus | null {
  return typeof value === "string" &&
    (FBR_INVOICE_STATUSES as readonly string[]).includes(value)
    ? (value as FbrInvoiceStatus)
    : null;
}

/** Province names accepted by the digital invoicing sample payloads. */
export const FBR_PROVINCES = [
  "Sindh",
  "Punjab",
  "Balochistan",
  "Khyber Pakhtunkhwa",
  "Islamabad Capital Territory",
  "Gilgit-Baltistan",
  "Azad Jammu and Kashmir",
] as const;

export const FBR_SANDBOX_POST_URL =
  "https://gw.fbr.gov.pk/di_data/v1/di/postinvoicedata_sb";
export const FBR_PRODUCTION_POST_URL =
  "https://gw.fbr.gov.pk/di_data/v1/di/postinvoicedata";

export const DEFAULT_FBR_SCENARIO_ID = "SN026";
export const FBR_STANDARD_SALE_TYPE = "Goods at standard rate (default)";
export const FBR_UOM_NUMBERS = "Numbers, pieces, units";

/**
 * Public SN026 sample buyer from the DI scenario spec.
 * Sandbox posts use this shape; it is not a login or token.
 */
export const FBR_SANDBOX_BUYER_NTN = "1000000000078";
export const FBR_SANDBOX_BUYER_NAME = "FERTILIZER MANUFAC IRS NEW";

export function normalizeHsCode(
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

export function hsCodeError(value: string, required: boolean): string | null {
  const trimmed = value.trim();
  if (!trimmed) return required ? "HS code is required" : null;
  if (!HS_CODE_PATTERN.test(trimmed)) {
    return "HS code must look like 0101.2100";
  }
  return null;
}
