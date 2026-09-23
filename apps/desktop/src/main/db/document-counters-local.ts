import {
  type DocumentCounterType,
  businessInitials,
  documentNumberPrefix,
  maxSequentialSuffix,
  DEMO_STORE_TENANT_ID,
} from "@blackbox/shared";
import type Database from "better-sqlite3";
import { getLocalDb } from "./index";
import { readIdentity } from "./identity";

type NumberSource = {
  table: string;
  column: string;
};

const NUMBER_SOURCES: Record<DocumentCounterType, NumberSource> = {
  PO: { table: "purchase_orders", column: "po_number" },
  PV: { table: "goods_receipts", column: "receipt_number" },
  IO: { table: "inventory_outs", column: "out_number" },
  IR: { table: "inventory_out_returns", column: "return_number" },
  SB: { table: "sales", column: "sale_number" },
  SR: { table: "sale_returns", column: "return_number" },
  HOLD: { table: "sales", column: "sale_number" },
  VR: { table: "vendor_returns", column: "return_number" },
  V: { table: "vendors", column: "vendor_code" },
};

function listExistingNumbers(
  db: Database.Database,
  source: NumberSource,
): string[] {
  const rows = db
    .prepare(
      `select ${source.column} as value
       from ${source.table}
       where tenant_id = @tenantId`,
    )
    .all({ tenantId: DEMO_STORE_TENANT_ID }) as Array<{ value: string }>;
  return rows.map((row) => String(row.value));
}

function ensureCounterFloor(
  db: Database.Database,
  documentType: DocumentCounterType,
  deviceId: string,
  prefix: string,
): void {
  const source = NUMBER_SOURCES[documentType];
  const existing = listExistingNumbers(db, source);
  const floor = maxSequentialSuffix(prefix, existing) + 1;
  const row = db
    .prepare(
      `select next_value as nextValue
       from document_counters
       where document_type = @documentType and device_id = @deviceId`,
    )
    .get({ documentType, deviceId }) as { nextValue: number } | undefined;

  if (!row) {
    db.prepare(
      `insert into document_counters (document_type, device_id, next_value)
       values (@documentType, @deviceId, @nextValue)`,
    ).run({ documentType, deviceId, nextValue: floor });
    return;
  }

  if (row.nextValue < floor) {
    db.prepare(
      `update document_counters
       set next_value = @nextValue
       where document_type = @documentType and device_id = @deviceId`,
    ).run({ documentType, deviceId, nextValue: floor });
  }
}

export function allocateDocumentNumberLocal(input: {
  documentType: DocumentCounterType;
  tenantName: string;
  deviceCode: string;
}): string {
  const identity = readIdentity();
  if (!identity?.deviceId) {
    throw new Error("Device identity is not bound");
  }

  const db = getLocalDb();
  const initials = businessInitials(input.tenantName);
  const prefix = documentNumberPrefix(
    input.documentType,
    initials,
    input.deviceCode,
  );

  return db.transaction(() => {
    ensureCounterFloor(db, input.documentType, identity.deviceId, prefix);

    db.prepare(
      `insert into document_counters (document_type, device_id, next_value)
       values (@documentType, @deviceId, 1)
       on conflict(document_type, device_id) do nothing`,
    ).run({
      documentType: input.documentType,
      deviceId: identity.deviceId,
    });

    const row = db
      .prepare(
        `select next_value as nextValue
         from document_counters
         where document_type = @documentType and device_id = @deviceId`,
      )
      .get({
        documentType: input.documentType,
        deviceId: identity.deviceId,
      }) as { nextValue: number };

    const seq = row.nextValue;
    db.prepare(
      `update document_counters
       set next_value = next_value + 1
       where document_type = @documentType and device_id = @deviceId`,
    ).run({
      documentType: input.documentType,
      deviceId: identity.deviceId,
    });

    return `${prefix}${String(seq).padStart(2, "0")}`;
  })();
}
