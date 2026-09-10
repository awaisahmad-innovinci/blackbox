import {
  nextOutNumber,
  nextPoNumber,
  nextReceiptNumber,
  nextSkuCodeForProduct,
  nextVendorCode,
} from "@blackbox/shared";
import { goodsReceiptsApi } from "@renderer/lib/api/goods-receipts";
import { inventoryOutApi } from "@renderer/lib/api/inventory-out";
import { purchaseOrdersApi } from "@renderer/lib/api/purchase-orders";
import { loadVendors } from "@renderer/lib/local-db/entity-source";

async function existingVendorCodes(): Promise<string[]> {
  try {
    const local = await window.blackbox?.localDb?.listVendors?.({
      status: "all",
      pageSize: 500,
    });
    if (local?.items.length) {
      return local.items.map((v) => v.vendorCode);
    }
  } catch {
    /* fall through */
  }
  const remote = await loadVendors({ status: "all", pageSize: 500 });
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

async function existingOutNumbers(): Promise<string[]> {
  try {
    const local = await window.blackbox?.localDb?.listOutNumbers?.();
    if (local?.length) return local;
  } catch {
    /* fall through */
  }
  try {
    const localOuts = await window.blackbox?.localDb?.listInventoryOuts?.({
      pageSize: 500,
    });
    if (localOuts?.items.length) {
      return localOuts.items.map((o) => o.outNumber);
    }
  } catch {
    /* fall through */
  }
  const remote = await inventoryOutApi.list({ pageSize: 500 });
  return remote.items.map((o) => o.outNumber);
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

export async function allocateOutNumber(tenantName: string): Promise<string> {
  return nextOutNumber(tenantName, await existingOutNumbers());
}
