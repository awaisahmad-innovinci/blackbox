import { ACTIVITY_LOGS_LAST_PULLED_AT_KEY } from "@renderer/lib/local-db/activity-log-pull";
import { INVENTORY_MOVEMENTS_LAST_PULLED_AT_KEY } from "@renderer/lib/local-db/inventory-movements-pull";
import {
  SALE_RETURNS_LAST_PULLED_AT_KEY,
  SALES_LAST_PULLED_AT_KEY,
} from "@renderer/lib/local-db/sales-pull";

export const CATALOG_OPERATIONAL_PAGE_KEYS = {
  sales: "catalog_sales_next_page",
  saleReturns: "catalog_sale_returns_next_page",
  activityLogs: "catalog_activity_logs_next_page",
  inventoryMovements: "catalog_inventory_movements_next_page",
} as const;

/** Clears REST sidecar watermarks and catalog page cursors for operational bootstrap. */
export async function resetOperationalPullState(): Promise<void> {
  const localDb = window.blackbox?.localDb;
  if (!localDb?.setSyncMeta) return;

  const keys = [
    SALES_LAST_PULLED_AT_KEY,
    SALE_RETURNS_LAST_PULLED_AT_KEY,
    ACTIVITY_LOGS_LAST_PULLED_AT_KEY,
    INVENTORY_MOVEMENTS_LAST_PULLED_AT_KEY,
    ...Object.values(CATALOG_OPERATIONAL_PAGE_KEYS),
  ];

  for (const key of keys) {
    await localDb.setSyncMeta(key, "");
  }
}