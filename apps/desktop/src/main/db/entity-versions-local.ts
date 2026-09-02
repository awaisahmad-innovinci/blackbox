import type { SyncEntityType } from "@blackbox/shared";
import { getLocalDb } from "./index";

export function getLocalEntityVersion(
  entityType: SyncEntityType | string,
  entityId: string,
): number {
  const row = getLocalDb()
    .prepare(
      `select entity_version as entityVersion
       from local_entity_versions
       where entity_type = @entityType and entity_id = @entityId`,
    )
    .get({ entityType, entityId }) as { entityVersion: number } | undefined;
  return row?.entityVersion ?? 0;
}

export function setLocalEntityVersion(
  entityType: SyncEntityType | string,
  entityId: string,
  entityVersion: number,
): void {
  if (entityVersion <= 0) return;
  getLocalDb()
    .prepare(
      `insert into local_entity_versions (entity_type, entity_id, entity_version)
       values (@entityType, @entityId, @entityVersion)
       on conflict(entity_type, entity_id) do update set
         entity_version = max(local_entity_versions.entity_version, excluded.entity_version)`,
    )
    .run({ entityType, entityId, entityVersion });
}

export function bumpLocalEntityVersion(
  entityType: SyncEntityType | string,
  entityId: string,
  baseEntityVersion: number,
): void {
  setLocalEntityVersion(entityType, entityId, baseEntityVersion + 1);
}

export function backfillLocalEntityVersions(db: import("better-sqlite3").Database): void {
  db.prepare(
    `insert into local_entity_versions (entity_type, entity_id, entity_version)
     select entity_type, entity_id, max(base_entity_version) + 1
     from local_sync_outbox
     where status = 'acked' and operation != 'EVENT'
     group by entity_type, entity_id
     on conflict(entity_type, entity_id) do update set
       entity_version = max(local_entity_versions.entity_version, excluded.entity_version)`,
  ).run();

  const tables: Array<{ entityType: SyncEntityType; table: string }> = [
    { entityType: "brand", table: "brands" },
    { entityType: "category", table: "categories" },
    { entityType: "vendor_group", table: "vendor_groups" },
    { entityType: "unit", table: "units" },
    { entityType: "warehouse", table: "warehouses" },
    { entityType: "product", table: "products" },
    { entityType: "product_sku", table: "product_skus" },
    { entityType: "vendor", table: "vendors" },
  ];

  for (const { entityType, table } of tables) {
    db.prepare(
      `insert into local_entity_versions (entity_type, entity_id, entity_version)
       select @entityType, id, 1
       from ${table}
       where id not in (
         select entity_id from local_entity_versions where entity_type = @entityType
       )`,
    ).run({ entityType });
  }
}
