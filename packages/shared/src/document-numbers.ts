/** First letters of each word, or first 3 alnum chars for a single word. */
export function businessInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    const initials = words
      .map((w) => w.replace(/[^a-zA-Z0-9]/g, "").charAt(0))
      .filter(Boolean)
      .join("")
      .toUpperCase();
    if (initials.length >= 2) return initials.slice(0, 6);
  }
  if (words.length === 1) {
    const alnum = words[0]!.replace(/[^a-zA-Z0-9]/g, "");
    if (alnum.length >= 1) return alnum.toUpperCase().slice(0, 3);
  }
  return "STORE";
}

/** PascalCase slug from product display name (`Red Bull` → `RedBull`). */
export function productNameSlug(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "SKU";
  const slug = parts
    .map((w) => {
      const alnum = w.replace(/[^a-zA-Z0-9]/g, "");
      if (!alnum) return "";
      return alnum.charAt(0).toUpperCase() + alnum.slice(1).toLowerCase();
    })
    .filter(Boolean)
    .join("");
  return slug || "SKU";
}

export const DOCUMENT_COUNTER_TYPES = [
  "PO",
  "PV",
  "IO",
  "IR",
  "SB",
  "SR",
  "HOLD",
  "VR",
  "V",
] as const;

export type DocumentCounterType = (typeof DOCUMENT_COUNTER_TYPES)[number];

function withDeviceSegment(basePrefix: string, deviceCode?: string | null): string {
  const code = deviceCode?.trim();
  if (!code) return basePrefix;
  return `${basePrefix}${code}-`;
}

/** Next code `{prefix}{paddedSeq}` scanning existing values with the same prefix. */
export function nextSequentialCode(
  prefix: string,
  existingCodes: string[],
  pad = 2,
): string {
  let max = 0;
  for (const code of existingCodes) {
    if (!code.startsWith(prefix)) continue;
    const suffix = code.slice(prefix.length);
    if (!/^\d+$/.test(suffix)) continue;
    const n = Number(suffix);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(pad, "0")}`;
}

export function vendorCodePrefix(
  initials: string,
  deviceCode?: string | null,
): string {
  return withDeviceSegment(`${initials}-V`, deviceCode);
}

export function poNumberPrefix(
  initials: string,
  deviceCode?: string | null,
): string {
  return withDeviceSegment(`${initials}-PO-`, deviceCode);
}

export function receiptNumberPrefix(
  initials: string,
  deviceCode?: string | null,
): string {
  return withDeviceSegment(`${initials}-PV-`, deviceCode);
}

export function outNumberPrefix(
  initials: string,
  deviceCode?: string | null,
): string {
  return withDeviceSegment(`${initials}-IO-`, deviceCode);
}

export function outReturnNumberPrefix(
  initials: string,
  deviceCode?: string | null,
): string {
  return withDeviceSegment(`${initials}-IR-`, deviceCode);
}

export function saleNumberPrefix(
  initials: string,
  deviceCode?: string | null,
): string {
  return withDeviceSegment(`${initials}-SB-`, deviceCode);
}

export function holdNumberPrefix(
  initials: string,
  deviceCode?: string | null,
): string {
  return withDeviceSegment(`${initials}-HOLD-`, deviceCode);
}

export function saleReturnNumberPrefix(
  initials: string,
  deviceCode?: string | null,
): string {
  return withDeviceSegment(`${initials}-SR-`, deviceCode);
}

export function vendorReturnNumberPrefix(
  initials: string,
  deviceCode?: string | null,
): string {
  return withDeviceSegment(`${initials}-VR-`, deviceCode);
}

export function documentNumberPrefix(
  documentType: DocumentCounterType,
  initials: string,
  deviceCode?: string | null,
): string {
  switch (documentType) {
    case "PO":
      return poNumberPrefix(initials, deviceCode);
    case "PV":
      return receiptNumberPrefix(initials, deviceCode);
    case "IO":
      return outNumberPrefix(initials, deviceCode);
    case "IR":
      return outReturnNumberPrefix(initials, deviceCode);
    case "SB":
      return saleNumberPrefix(initials, deviceCode);
    case "SR":
      return saleReturnNumberPrefix(initials, deviceCode);
    case "HOLD":
      return holdNumberPrefix(initials, deviceCode);
    case "VR":
      return vendorReturnNumberPrefix(initials, deviceCode);
    case "V":
      return vendorCodePrefix(initials, deviceCode);
    default:
      return `${initials}-`;
  }
}

export function nextVendorCode(
  businessName: string,
  existingVendorCodes: string[],
  deviceCode?: string | null,
): string {
  return nextSequentialCode(
    vendorCodePrefix(businessInitials(businessName), deviceCode),
    existingVendorCodes,
  );
}

export function nextPoNumber(
  businessName: string,
  existingPoNumbers: string[],
  deviceCode?: string | null,
): string {
  return nextSequentialCode(
    poNumberPrefix(businessInitials(businessName), deviceCode),
    existingPoNumbers,
  );
}

export function nextReceiptNumber(
  businessName: string,
  existingReceiptNumbers: string[],
  deviceCode?: string | null,
): string {
  return nextSequentialCode(
    receiptNumberPrefix(businessInitials(businessName), deviceCode),
    existingReceiptNumbers,
  );
}

export function nextOutNumber(
  businessName: string,
  existingOutNumbers: string[],
  deviceCode?: string | null,
): string {
  return nextSequentialCode(
    outNumberPrefix(businessInitials(businessName), deviceCode),
    existingOutNumbers,
  );
}

export function nextOutReturnNumber(
  businessName: string,
  existingReturnNumbers: string[],
  deviceCode?: string | null,
): string {
  return nextSequentialCode(
    outReturnNumberPrefix(businessInitials(businessName), deviceCode),
    existingReturnNumbers,
  );
}

export function nextSaleNumber(
  businessName: string,
  existingSaleNumbers: string[],
  deviceCode?: string | null,
): string {
  return nextSequentialCode(
    saleNumberPrefix(businessInitials(businessName), deviceCode),
    existingSaleNumbers,
  );
}

export function nextHoldNumber(
  businessName: string,
  existingHoldNumbers: string[],
  deviceCode?: string | null,
): string {
  return nextSequentialCode(
    holdNumberPrefix(businessInitials(businessName), deviceCode),
    existingHoldNumbers,
  );
}

export function nextSaleReturnNumber(
  businessName: string,
  existingReturnNumbers: string[],
  deviceCode?: string | null,
): string {
  return nextSequentialCode(
    saleReturnNumberPrefix(businessInitials(businessName), deviceCode),
    existingReturnNumbers,
  );
}

export function nextVendorReturnNumber(
  businessName: string,
  existingReturnNumbers: string[],
  deviceCode?: string | null,
): string {
  return nextSequentialCode(
    vendorReturnNumberPrefix(businessInitials(businessName), deviceCode),
    existingReturnNumbers,
  );
}

/** Next SKU from product name: `Bunny-01`, `RedBull-02`, … */
export function nextSkuCodeForProduct(
  productName: string,
  existingSkus: string[],
): string {
  const slug = productNameSlug(productName);
  return nextSequentialCode(`${slug}-`, existingSkus);
}

/** Max numeric suffix for codes sharing a prefix (legacy + device-scoped). */
export function maxSequentialSuffix(
  prefix: string,
  existingCodes: string[],
): number {
  let max = 0;
  for (const code of existingCodes) {
    if (!code.startsWith(prefix)) continue;
    const suffix = code.slice(prefix.length);
    if (!/^\d+$/.test(suffix)) continue;
    const n = Number(suffix);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}
