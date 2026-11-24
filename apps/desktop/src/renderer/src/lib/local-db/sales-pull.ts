import type { SaleStatus } from "@blackbox/shared";
import { saleReturnsApi } from "@renderer/lib/api/sale-returns";
import { salesApi } from "@renderer/lib/api/sales";

export const SALES_LAST_PULLED_AT_KEY = "sales_last_pulled_at";
export const SALE_RETURNS_LAST_PULLED_AT_KEY = "sale_returns_last_pulled_at";

const PAGE_SIZE = 50;

const CLOUD_SALE_STATUSES: SaleStatus[] = ["POSTED", "VOID"];

function listDateFrom(watermark: string): string | undefined {
  const trimmed = watermark.trim();
  return trimmed.length >= 10 ? trimmed.slice(0, 10) : undefined;
}

async function pullSalesIntoLocal(): Promise<number> {
  const localDb = window.blackbox?.localDb;
  if (!localDb?.upsertSales || !localDb.getSyncMeta || !localDb.setSyncMeta) {
    return 0;
  }

  const lastPulled = await localDb.getSyncMeta(SALES_LAST_PULLED_AT_KEY);
  const dateFrom = listDateFrom(lastPulled ?? "");
  let merged = 0;
  let maxAt = lastPulled?.trim() ?? "";

  for (const status of CLOUD_SALE_STATUSES) {
    let page = 1;
    while (true) {
      const result = await salesApi.list({
        status,
        page,
        pageSize: PAGE_SIZE,
        dateFrom,
      });
      if (result.items.length > 0) {
        const details = await Promise.all(
          result.items.map((row) => salesApi.get(row.id)),
        );
        await localDb.upsertSales(details);
        merged += details.length;
        for (const sale of details) {
          const at = sale.postedAt ?? sale.updatedAt ?? sale.createdAt ?? "";
          if (at > maxAt) maxAt = at;
        }
      }
      if (result.items.length === 0 || page * result.pageSize >= result.total) {
        break;
      }
      page += 1;
    }
  }

  await localDb.setSyncMeta(
    SALES_LAST_PULLED_AT_KEY,
    maxAt.trim() || new Date().toISOString(),
  );
  return merged;
}

async function pullSaleReturnsIntoLocal(): Promise<number> {
  const localDb = window.blackbox?.localDb;
  const upsertReturn = localDb?.upsertSaleReturn;
  if (!upsertReturn || !localDb?.getSyncMeta || !localDb?.setSyncMeta) {
    return 0;
  }

  const lastPulled = await localDb.getSyncMeta(SALE_RETURNS_LAST_PULLED_AT_KEY);
  const dateFrom = listDateFrom(lastPulled ?? "");
  let page = 1;
  let merged = 0;
  let maxAt = lastPulled?.trim() ?? "";

  while (true) {
    const result = await saleReturnsApi.list({
      page,
      pageSize: PAGE_SIZE,
      dateFrom,
    });
    if (result.items.length > 0) {
      const details = await Promise.all(
        result.items.map((row) => saleReturnsApi.get(row.id)),
      );
      for (const detail of details) {
        await upsertReturn(detail);
      }
      merged += details.length;
      for (const row of details) {
        const at = row.refundedAt ?? row.updatedAt ?? row.createdAt ?? row.returnDate;
        if (at > maxAt) maxAt = at;
      }
    }
    if (result.items.length === 0 || page * result.pageSize >= result.total) {
      break;
    }
    page += 1;
  }

  await localDb.setSyncMeta(
    SALE_RETURNS_LAST_PULLED_AT_KEY,
    maxAt.trim() || new Date().toISOString(),
  );
  return merged;
}

/** Hydrate posted/void sales and returns from the API into SQLite (catalog / incremental sync). */
export async function pullSalesAndReturnsIntoLocal(): Promise<number> {
  const sales = await pullSalesIntoLocal();
  const returns = await pullSaleReturnsIntoLocal();
  return sales + returns;
}