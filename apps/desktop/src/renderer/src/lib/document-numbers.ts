import {
  nextPoNumber,
  nextReceiptNumber,
  nextVendorCode,
} from "@blackbox/shared";
import { goodsReceiptsApi } from "@renderer/lib/api/goods-receipts";
import { purchaseOrdersApi } from "@renderer/lib/api/purchase-orders";
import { loadVendors } from "@renderer/lib/local-db/entity-source";

async function existingVendorCodes(): Promise<string[]> {
  try {
    const local = await window.blackbox?.localDb?.listVendors?.({
      pageSize: 500,
    });
    if (local?.items.length) {
      return local.items.map((v) => v.vendorCode);
    }
  } catch {
    /* fall through */
  }
  const remote = await loadVendors({ pageSize: 500 });
  return remote.items.map((v) => v.vendorCode);
}

async function existingPoNumbers(): Promise<string[]> {
  try {
    const local = await window.blackbox?.localDb?.listPoNumbers?.();
    if (local?.length) return local;
  } catch {
    /* fall through */
  }
  try {
    const localPos = await window.blackbox?.localDb?.listPurchaseOrders?.({
      pageSize: 500,
    });
    if (localPos?.items.length) {
      return localPos.items.map((p) => p.poNumber);
    }
  } catch {
    /* fall through */
  }
  const remote = await purchaseOrdersApi.list({ pageSize: 500 });
  return remote.items.map((p) => p.poNumber);
}

async function existingReceiptNumbers(): Promise<string[]> {
  try {
    const local = await window.blackbox?.localDb?.listReceiptNumbers?.();
    if (local?.length) return local;
  } catch {
    /* fall through */
  }
  const remote = await goodsReceiptsApi.list({ pageSize: 500 });
  return remote.items.map((r) => r.receiptNumber);
}

export async function allocateVendorCode(tenantName: string): Promise<string> {
  return nextVendorCode(tenantName, await existingVendorCodes());
}

export async function allocatePoNumber(tenantName: string): Promise<string> {
  return nextPoNumber(tenantName, await existingPoNumbers());
}

export async function allocateReceiptNumber(
  tenantName: string,
): Promise<string> {
  return nextReceiptNumber(tenantName, await existingReceiptNumbers());
}
