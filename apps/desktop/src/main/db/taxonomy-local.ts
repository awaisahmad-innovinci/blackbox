import type {
  Brand,
  Category,
  UnitListItem,
  VendorGroup,
} from "@blackbox/shared";
import { DEMO_STORE_TENANT_ID } from "@blackbox/shared";
import { getLocalDb } from "./index";

function nowIso(): string {
  return new Date().toISOString();
}

export function upsertBrandLocal(row: Brand): void {
  const db = getLocalDb();
  const ts = nowIso();
  db.prepare(
    `insert into brands (
      id, tenant_id, name, description, status,
      created_at, updated_at, sync_status, server_updated_at
    ) values (
      @id, @tenantId, @name, @description, @status,
      @createdAt, @updatedAt, 'synced', @serverUpdatedAt
    )
    on conflict(id) do update set
      name = excluded.name,
      description = excluded.description,
      status = excluded.status,
      updated_at = excluded.updated_at,
      sync_status = 'synced',
      server_updated_at = excluded.server_updated_at`,
  ).run({
    id: row.id,
    tenantId: DEMO_STORE_TENANT_ID,
    name: row.name,
    description: row.description,
    status: row.status,
    createdAt: ts,
    updatedAt: ts,
    serverUpdatedAt: ts,
  });
}

export function upsertCategoryLocal(row: Category): void {
  const db = getLocalDb();
  const ts = nowIso();
  db.prepare(
    `insert into categories (
      id, tenant_id, name, description, status,
      created_at, updated_at, sync_status, server_updated_at
    ) values (
      @id, @tenantId, @name, @description, @status,
      @createdAt, @updatedAt, 'synced', @serverUpdatedAt
    )
    on conflict(id) do update set
      name = excluded.name,
      description = excluded.description,
      status = excluded.status,
      updated_at = excluded.updated_at,
      sync_status = 'synced',
      server_updated_at = excluded.server_updated_at`,
  ).run({
    id: row.id,
    tenantId: DEMO_STORE_TENANT_ID,
    name: row.name,
    description: row.description,
    status: row.status,
    createdAt: ts,
    updatedAt: ts,
    serverUpdatedAt: ts,
  });
}

export function upsertUnitLocal(row: UnitListItem): void {
  const db = getLocalDb();
  const ts = nowIso();
  db.prepare(
    `insert into units (
      id, tenant_id, name, abbreviation, type, status,
      created_at, updated_at, sync_status, server_updated_at
    ) values (
      @id, @tenantId, @name, @abbreviation, @type, @status,
      @createdAt, @updatedAt, 'synced', @serverUpdatedAt
    )
    on conflict(id) do update set
      name = excluded.name,
      abbreviation = excluded.abbreviation,
      type = excluded.type,
      status = excluded.status,
      updated_at = excluded.updated_at,
      sync_status = 'synced',
      server_updated_at = excluded.server_updated_at`,
  ).run({
    id: row.id,
    tenantId: DEMO_STORE_TENANT_ID,
    name: row.name,
    abbreviation: row.abbreviation,
    type: row.type,
    status: row.status,
    createdAt: ts,
    updatedAt: ts,
    serverUpdatedAt: ts,
  });
}

export function upsertVendorGroupLocal(row: VendorGroup): void {
  const db = getLocalDb();
  const ts = nowIso();
  db.prepare(
    `insert into vendor_groups (
      id, tenant_id, name, description, status,
      created_at, updated_at, sync_status, server_updated_at
    ) values (
      @id, @tenantId, @name, @description, @status,
      @createdAt, @updatedAt, 'synced', @serverUpdatedAt
    )
    on conflict(id) do update set
      name = excluded.name,
      description = excluded.description,
      status = excluded.status,
      updated_at = excluded.updated_at,
      sync_status = 'synced',
      server_updated_at = excluded.server_updated_at`,
  ).run({
    id: row.id,
    tenantId: DEMO_STORE_TENANT_ID,
    name: row.name,
    description: row.description,
    status: row.status,
    createdAt: ts,
    updatedAt: ts,
    serverUpdatedAt: ts,
  });
}

export function upsertBrandsLocal(rows: Brand[]): void {
  const db = getLocalDb();
  const tx = db.transaction(() => {
    for (const row of rows) upsertBrandLocal(row);
  });
  tx();
}

export function upsertCategoriesLocal(rows: Category[]): void {
  const db = getLocalDb();
  const tx = db.transaction(() => {
    for (const row of rows) upsertCategoryLocal(row);
  });
  tx();
}

export function upsertUnitsLocal(rows: UnitListItem[]): void {
  const db = getLocalDb();
  const tx = db.transaction(() => {
    for (const row of rows) upsertUnitLocal(row);
  });
  tx();
}

export function upsertVendorGroupsLocal(rows: VendorGroup[]): void {
  const db = getLocalDb();
  const tx = db.transaction(() => {
    for (const row of rows) upsertVendorGroupLocal(row);
  });
  tx();
}
