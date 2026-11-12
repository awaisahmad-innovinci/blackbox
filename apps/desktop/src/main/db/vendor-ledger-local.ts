import type {
  PaginatedVendorPayments,
  VendorCreditLedger,
  VendorCreditQuery,
  VendorCreditSummary,
  VendorLedger,
  VendorLedgerEntry,
  VendorPaymentListItem,
  VendorPaymentListQuery,
} from "@blackbox/shared";
import { DEMO_STORE_TENANT_ID, roundMoney4 } from "@blackbox/shared";
import { getLocalDb } from "./index";

export function upsertVendorLedgerEntryLocal(entry: VendorLedgerEntry): void {
  const db = getLocalDb();
  db.prepare(
    `insert into vendor_ledger_entries (
      id, tenant_id, vendor_id, entry_type, amount, goods_receipt_id,
      receipt_number, note, occurred_at, created_at, updated_at,
      sync_status, server_updated_at
    ) values (
      @id, @tenantId, @vendorId, @entryType, @amount, @goodsReceiptId,
      @receiptNumber, @note, @occurredAt, @createdAt, @updatedAt,
      'synced', @serverUpdatedAt
    )
    on conflict(id) do update set
      vendor_id = excluded.vendor_id,
      entry_type = excluded.entry_type,
      amount = excluded.amount,
      goods_receipt_id = excluded.goods_receipt_id,
      receipt_number = excluded.receipt_number,
      note = excluded.note,
      occurred_at = excluded.occurred_at,
      updated_at = excluded.updated_at,
      sync_status = 'synced',
      server_updated_at = excluded.server_updated_at`,
  ).run({
    id: entry.id,
    tenantId: DEMO_STORE_TENANT_ID,
    vendorId: entry.vendorId,
    entryType: entry.entryType,
    amount: entry.amount,
    goodsReceiptId: entry.goodsReceiptId,
    receiptNumber: entry.receiptNumber,
    note: entry.note,
    occurredAt: entry.occurredAt,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    serverUpdatedAt: entry.updatedAt,
  });
}

export function listVendorCreditsLocal(
  query: VendorCreditQuery = {},
): VendorCreditLedger {
  const db = getLocalDb();
  const where = ["e.tenant_id = @tenantId"];
  const params: Record<string, string> = { tenantId: DEMO_STORE_TENANT_ID };
  if (query.vendorId) {
    where.push("e.vendor_id = @vendorId");
    params.vendorId = query.vendorId;
  }
  const rows = db
    .prepare(
      `select
         e.vendor_id as vendorId,
         coalesce(v.name, '') as vendorName,
         coalesce(sum(case when e.entry_type = 'CHARGE' then e.amount else 0 end), 0) as charges,
         coalesce(sum(case when e.entry_type = 'PAYMENT' then e.amount else 0 end), 0) as payments
       from vendor_ledger_entries e
       left join vendors v on v.id = e.vendor_id and v.tenant_id = e.tenant_id
       where ${where.join(" and ")}
       group by e.vendor_id`,
    )
    .all(params) as Array<{
    vendorId: string;
    vendorName: string;
    charges: number;
    payments: number;
  }>;
  const vendors: VendorCreditSummary[] = rows
    .map((row) => {
      const charges = roundMoney4(Number(row.charges));
      const payments = roundMoney4(Number(row.payments));
      return {
        vendorId: row.vendorId,
        vendorName: row.vendorName,
        charges,
        payments,
        credit: roundMoney4(charges - payments),
      };
    })
    .sort(
      (a, b) => b.credit - a.credit || a.vendorName.localeCompare(b.vendorName),
    );
  return {
    totalCredit: roundMoney4(vendors.reduce((sum, row) => sum + row.credit, 0)),
    vendors,
  };
}

export function listVendorPaymentsLocal(
  query: VendorPaymentListQuery = {},
): PaginatedVendorPayments {
  const db = getLocalDb();
  const page = query.page && query.page > 0 ? query.page : 1;
  const pageSize = Math.min(
    query.pageSize && query.pageSize > 0 ? query.pageSize : 20,
    100,
  );
  const where = [
    "e.tenant_id = @tenantId",
    "e.entry_type = 'PAYMENT'",
  ];
  const params: Record<string, string | number> = {
    tenantId: DEMO_STORE_TENANT_ID,
  };
  if (query.vendorId) {
    where.push("e.vendor_id = @vendorId");
    params.vendorId = query.vendorId;
  }
  const search = query.search?.trim();
  if (search) {
    where.push(
      "(lower(coalesce(v.name, '')) like @search or lower(coalesce(e.note, '')) like @search or lower(coalesce(e.receipt_number, '')) like @search)",
    );
    params.search = `%${search.toLowerCase()}%`;
  }
  const whereSql = where.join(" and ");
  const fromSql = `from vendor_ledger_entries e
    left join vendors v on v.id = e.vendor_id and v.tenant_id = e.tenant_id
    where ${whereSql}`;
  const total = Number(
    (
      db.prepare(`select count(*) as cnt ${fromSql}`).get(params) as {
        cnt: number;
      }
    ).cnt,
  );
  const rows = db
    .prepare(
      `select
         e.id as id,
         e.vendor_id as vendorId,
         coalesce(v.name, '') as vendorName,
         e.amount as amount,
         e.receipt_number as receiptNumber,
         e.note as note,
         e.occurred_at as occurredAt
       ${fromSql}
       order by e.occurred_at desc, e.created_at desc
       limit @limit offset @offset`,
    )
    .all({
      ...params,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    }) as Array<{
    id: string;
    vendorId: string;
    vendorName: string;
    amount: number;
    receiptNumber: string | null;
    note: string | null;
    occurredAt: string;
  }>;
  const items: VendorPaymentListItem[] = rows.map((row) => ({
    id: row.id,
    vendorId: row.vendorId,
    vendorName: row.vendorName,
    amount: Number(row.amount),
    receiptNumber: row.receiptNumber,
    note: row.note ?? "",
    occurredAt: row.occurredAt,
  }));
  return { items, total, page, pageSize };
}

export function getVendorLedgerLocal(vendorId: string): VendorLedger {
  const db = getLocalDb();
  const rows = db
    .prepare(
      `select
         id,
         vendor_id as vendorId,
         entry_type as entryType,
         amount,
         goods_receipt_id as goodsReceiptId,
         receipt_number as receiptNumber,
         note,
         occurred_at as occurredAt,
         created_at as createdAt,
         updated_at as updatedAt
       from vendor_ledger_entries
       where tenant_id = ? and vendor_id = ?
       order by occurred_at desc, created_at desc`,
    )
    .all(DEMO_STORE_TENANT_ID, vendorId) as Array<{
    id: string;
    vendorId: string;
    entryType: string;
    amount: number;
    goodsReceiptId: string | null;
    receiptNumber: string | null;
    note: string;
    occurredAt: string;
    createdAt: string;
    updatedAt: string;
  }>;

  const entries: VendorLedgerEntry[] = rows.map((row) => ({
    id: row.id,
    vendorId: row.vendorId,
    entryType: row.entryType === "PAYMENT" ? "PAYMENT" : "CHARGE",
    amount: Number(row.amount),
    goodsReceiptId: row.goodsReceiptId,
    receiptNumber: row.receiptNumber,
    note: row.note ?? "",
    occurredAt: row.occurredAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));

  const credit = roundMoney4(
    entries.reduce(
      (sum, entry) =>
        sum + (entry.entryType === "CHARGE" ? entry.amount : -entry.amount),
      0,
    ),
  );

  return { credit, entries };
}
