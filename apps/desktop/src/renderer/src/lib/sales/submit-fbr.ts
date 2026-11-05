import type { SaleDetail } from "@blackbox/shared";
import { getApiErrorMessage } from "@renderer/lib/api/client";
import { salesApi } from "@renderer/lib/api/sales";

function isOfflineError(error: unknown, message: string): boolean {
  return (
    error instanceof TypeError ||
    /offline|failed to fetch|network|could not reach fbr/i.test(message)
  );
}

async function cacheSale(detail: SaleDetail): Promise<void> {
  try {
    await window.blackbox?.localDb?.upsertSale?.(detail);
  } catch {
    /* local cache is best-effort */
  }
}

function failedSale(detail: SaleDetail, message: string): SaleDetail {
  return {
    ...detail,
    fbrStatus: "failed",
    fbrError: message || "FBR invoice was not issued",
  };
}

function pendingSale(detail: SaleDetail): SaleDetail {
  return {
    ...detail,
    fbrStatus: "pending",
    fbrError: null,
  };
}

/** Send this sale with the FBR request and store the invoice number or the error. */
export async function submitPostedSaleToFbr(
  detail: SaleDetail,
): Promise<SaleDetail> {
  if (detail.status !== "POSTED") return detail;
  if (detail.fbrStatus === "excluded") return detail;
  if (detail.fbrStatus === "submitted" && detail.fbrInvoiceNumber) return detail;

  try {
    const updated = await salesApi.submitFbr(detail.id, detail);
    await cacheSale(updated);
    return updated;
  } catch (error: unknown) {
    const message = getApiErrorMessage(error, "FBR invoice was not issued");
    const next = isOfflineError(error, message)
      ? pendingSale(detail)
      : failedSale(detail, message);
    await cacheSale(next);
    return next;
  }
}
