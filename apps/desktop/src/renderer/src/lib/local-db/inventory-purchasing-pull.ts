import { inventoryOutReturnsApi } from "@renderer/lib/api/inventory-out-returns";
import { vendorsApi } from "@renderer/lib/api/vendors";

export const INVENTORY_OUT_RETURNS_LAST_PULLED_AT_KEY =
  "inventory_out_returns_last_pulled_at";
export const VENDOR_LEDGER_LAST_PULLED_AT_KEY = "vendor_ledger_last_pulled_at";

const PAGE_SIZE = 50;
const VENDOR_PAGE_SIZE = 100;

function listDateFrom(watermark: string): string | undefined {
  const trimmed = watermark.trim();
  return trimmed.length >= 10 ? trimmed.slice(0, 10) : undefined;
}

async function pullInventoryOutReturnsIntoLocal(): Promise<number> {
  const localDb = window.blackbox?.localDb;
  const upsert = localDb?.upsertInventoryOutReturns;
  if (!upsert || !localDb?.getSyncMeta || !localDb?.setSyncMeta) {
    return 0;
  }

  const lastPulled = await localDb.getSyncMeta(INVENTORY_OUT_RETURNS_LAST_PULLED_AT_KEY);
  const dateFrom = listDateFrom(lastPulled ?? "");
  let page = 1;
  let merged = 0;
  let maxAt = lastPulled?.trim() ?? "";

  while (true) {
    const result = await inventoryOutReturnsApi.list({
      page,
      pageSize: PAGE_SIZE,
      dateFrom,
    });
    if (result.items.length > 0) {
      const details = await Promise.all(
        result.items.map((row) => inventoryOutReturnsApi.get(row.id)),
      );
      await upsert(details);
      merged += details.length;
      for (const row of details) {
        const at = row.updatedAt ?? row.createdAt ?? row.returnDate;
        if (at > maxAt) maxAt = at;
      }
    }
    if (result.items.length === 0 || page * result.pageSize >= result.total) {
      break;
    }
    page += 1;
  }

  await localDb.setSyncMeta(
    INVENTORY_OUT_RETURNS_LAST_PULLED_AT_KEY,
    maxAt.trim() || new Date().toISOString(),
  );
  return merged;
}

async function pullVendorLedgerIntoLocal(): Promise<number> {
  const localDb = window.blackbox?.localDb;
  const upsert = localDb?.upsertVendorLedgerEntriesFromPull;
  if (!upsert || !localDb?.getSyncMeta || !localDb?.setSyncMeta) {
    return 0;
  }

  let page = 1;
  let merged = 0;
  let maxAt = (await localDb.getSyncMeta(VENDOR_LEDGER_LAST_PULLED_AT_KEY))?.trim() ?? "";

  while (true) {
    const vendors = await vendorsApi.list({ page, pageSize: VENDOR_PAGE_SIZE });
    if (vendors.items.length === 0) break;

    for (const vendor of vendors.items) {
      const ledger = await vendorsApi.ledger(vendor.id);
      if (ledger.entries.length > 0) {
        await upsert(ledger.entries);
        merged += ledger.entries.length;
        for (const entry of ledger.entries) {
          const at = entry.updatedAt ?? entry.occurredAt ?? entry.createdAt;
          if (at > maxAt) maxAt = at;
        }
      }
    }

    if (page * vendors.pageSize >= vendors.total) break;
    page += 1;
  }

  await localDb.setSyncMeta(
    VENDOR_LEDGER_LAST_PULLED_AT_KEY,
    maxAt.trim() || new Date().toISOString(),
  );
  return merged;
}

/** Inventory out returns and vendor ledger entries from the API into SQLite. */
export async function pullInventoryPurchasingIntoLocal(): Promise<number> {
  const outReturns = await pullInventoryOutReturnsIntoLocal();
  const ledger = await pullVendorLedgerIntoLocal();
  return outReturns + ledger;
}