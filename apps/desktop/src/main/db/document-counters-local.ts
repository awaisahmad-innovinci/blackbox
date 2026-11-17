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

  // Vendor previews used to increment on open. Pull the counter back to the
  // next code after the last saved vendor so cancelled forms do not leave gaps.
  const snapToSaved =
    documentType === "V" && row.nextValue > floor;
  if (row.nextValue < floor || snapToSaved) {
    db.prepare(
      `update document_counters
       set next_value = @nextValue
       where document_type = @documentType and device_id = @deviceId`,
    ).run({ documentType, deviceId, nextValue: floor });
  }
}

type DocumentNumberInput = {
  documentType: DocumentCounterType;
  tenantName: string;
  deviceCode: string;
};

function readNextSequence(
  db: Database.Database,
  input: DocumentNumberInput,
  deviceId: string,
  prefix: string,
): number {
  ensureCounterFloor(db, input.documentType, deviceId, prefix);

  db.prepare(
    `insert into document_counters (document_type, device_id, next_value)
     values (@documentType, @deviceId, 1)
     on conflict(document_type, device_id) do nothing`,
  ).run({
    documentType: input.documentType,
    deviceId,
  });

  const row = db
    .prepare(
      `select next_value as nextValue
       from document_counters
       where document_type = @documentType and device_id = @deviceId`,
    )
    .get({
      documentType: input.documentType,
      deviceId,
    }) as { nextValue: number };

  return row.nextValue;
}

function withDocumentNumber<T>(
  input: DocumentNumberInput,
  run: (
    db: Database.Database,
    deviceId: string,
    prefix: string,
  ) => T,
): T {
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

  return db.transaction(() =>
    run(db, identity.deviceId, prefix),
  )();
}

function formatSequence(prefix: string, seq: number): string {
  return `${prefix}${String(seq).padStart(2, "0")}`;
}

/** Next code for display. Does not advance the counter. */
export function peekDocumentNumberLocal(input: DocumentNumberInput): string {
  return withDocumentNumber(input, (db, deviceId, prefix) => {
    const seq = readNextSequence(db, input, deviceId, prefix);
    return formatSequence(prefix, seq);
  });
}

export function allocateDocumentNumberLocal(input: DocumentNumberInput): string {
  return withDocumentNumber(input, (db, deviceId, prefix) => {
    const seq = readNextSequence(db, input, deviceId, prefix);
    db.prepare(
      `update document_counters
       set next_value = next_value + 1
       where document_type = @documentType and device_id = @deviceId`,
    ).run({
      documentType: input.documentType,
      deviceId,
    });
    return formatSequence(prefix, seq);
  });
}
