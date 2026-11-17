import type { DocumentCounterType } from "@blackbox/shared";
import { nextSkuCodeForProduct } from "@blackbox/shared";
import { resolveDeviceCode } from "@renderer/lib/device-code";

async function withDocumentNumber(
  documentType: DocumentCounterType,
  tenantName: string,
  mode: "allocate" | "peek",
): Promise<string> {
  const deviceCode = await resolveDeviceCode();
  const fn =
    mode === "peek"
      ? window.blackbox?.localDb?.peekDocumentNumber
      : window.blackbox?.localDb?.allocateDocumentNumber;
  if (!fn) {
    throw new Error("Local document numbering is unavailable");
  }
  return fn({ documentType, tenantName, deviceCode });
}

async function allocate(documentType: DocumentCounterType, tenantName: string): Promise<string> {
  return withDocumentNumber(documentType, tenantName, "allocate");
}

async function peek(documentType: DocumentCounterType, tenantName: string): Promise<string> {
  return withDocumentNumber(documentType, tenantName, "peek");
}

async function existingSkuCodes(): Promise<string[]> {
  try {
    const local = await window.blackbox?.localDb?.listSkuCodes?.();
    if (local != null) return local;
  } catch {
    /* fall through */
  }
  return [];
}

export async function allocateSkuCode(productName: string): Promise<string> {
  return nextSkuCodeForProduct(productName, await existingSkuCodes());
}

export async function allocateVendorCode(tenantName: string): Promise<string> {
  return allocate("V", tenantName);
}

export async function peekVendorCode(tenantName: string): Promise<string> {
  return peek("V", tenantName);
}

export async function allocatePoNumber(tenantName: string): Promise<string> {
  return allocate("PO", tenantName);
}

export async function allocateReceiptNumber(tenantName: string): Promise<string> {
  return allocate("PV", tenantName);
}

export async function allocateOutNumber(tenantName: string): Promise<string> {
  return allocate("IO", tenantName);
}

export async function allocateOutReturnNumber(tenantName: string): Promise<string> {
  return allocate("IR", tenantName);
}

export async function allocateSaleNumber(tenantName: string): Promise<string> {
  return allocate("SB", tenantName);
}

export async function allocateSaleReturnNumber(tenantName: string): Promise<string> {
  return allocate("SR", tenantName);
}

export async function allocateHoldNumber(tenantName: string): Promise<string> {
  return allocate("HOLD", tenantName);
}

export async function allocateVendorReturnNumber(tenantName: string): Promise<string> {
  return allocate("VR", tenantName);
}
