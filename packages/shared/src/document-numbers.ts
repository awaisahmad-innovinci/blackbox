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

export function vendorCodePrefix(initials: string): string {
  return `${initials}-V`;
}

export function poNumberPrefix(initials: string): string {
  return `${initials}-PO-`;
}

export function receiptNumberPrefix(initials: string): string {
  return `${initials}-PV-`;
}

export function nextVendorCode(
  businessName: string,
  existingVendorCodes: string[],
): string {
  return nextSequentialCode(
    vendorCodePrefix(businessInitials(businessName)),
    existingVendorCodes,
  );
}

export function nextPoNumber(
  businessName: string,
  existingPoNumbers: string[],
): string {
  return nextSequentialCode(
    poNumberPrefix(businessInitials(businessName)),
    existingPoNumbers,
  );
}

export function nextReceiptNumber(
  businessName: string,
  existingReceiptNumbers: string[],
): string {
  return nextSequentialCode(
    receiptNumberPrefix(businessInitials(businessName)),
    existingReceiptNumbers,
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
