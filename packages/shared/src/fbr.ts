export const HS_CODE_PATTERN = /^\d{3,4}\.\d{1,4}$/;

export const HS_CODE_MESSAGE =
  "HS code must look like 804.102, 910.91, 1704.909, or 0101.1212";

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
  const trimmed = value?.replace(/\u00a0/g, " ").trim() ?? "";
  if (!trimmed) return null;
  const compact = trimmed.replace(/[\s\u00a0]+/g, "").replace(/,/g, ".");
  const digitsAndDots = compact.replace(/[^\d.]/g, "");
  if (!digitsAndDots) return null;
  const firstDot = digitsAndDots.indexOf(".");
  const normalized =
    firstDot === -1
      ? digitsAndDots
      : `${digitsAndDots.slice(0, firstDot)}.${digitsAndDots
          .slice(firstDot + 1)
          .replace(/\./g, "")}`;
  return normalized || null;
}

export function hsCodeError(value: string, required: boolean): string | null {
  const trimmed = value.replace(/\u00a0/g, " ").trim();
  if (!trimmed) return required ? "HS code is required" : null;
  const normalized = normalizeHsCode(value);
  if (!normalized || !HS_CODE_PATTERN.test(normalized)) {
    return HS_CODE_MESSAGE;
  }
  return null;
}
