import type { WarehouseListItem } from "@blackbox/shared";
import { DEMO_STORE_TENANT_ID } from "@blackbox/shared";
import { getLocalDb } from "./index";

function nowIso(): string {
  return new Date().toISOString();
}

export function upsertWarehouseLocal(row: WarehouseListItem): void {
  const db = getLocalDb();
  const ts = nowIso();
  db.prepare(
    `insert into warehouses (
      id, tenant_id, name, code, location, status,
      created_at, updated_at, sync_status, server_updated_at
    ) values (
      @id, @tenantId, @name, @code, @location, @status,
      @createdAt, @updatedAt, 'synced', @serverUpdatedAt
    )
    on conflict(id) do update set
      name = excluded.name,
      code = excluded.code,
      location = excluded.location,
      status = excluded.status,
      updated_at = excluded.updated_at,
      sync_status = 'synced',
      server_updated_at = excluded.server_updated_at`,
  ).run({
    id: row.id,
    tenantId: DEMO_STORE_TENANT_ID,
    name: row.name,
    code: row.code,
    location: row.location,
    status: row.status,
    createdAt: ts,
    updatedAt: ts,
    serverUpdatedAt: ts,
  });
}

export function upsertWarehousesLocal(rows: WarehouseListItem[]): void {
  const db = getLocalDb();
  const tx = db.transaction(() => {
    for (const row of rows) upsertWarehouseLocal(row);
  });
  tx();
}
