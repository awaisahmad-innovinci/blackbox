import {
  DEMO_STORE_TENANT_ID,
  applyTaxReportCollectedTaxKind,
  applyTaxReportPaidTaxKind,
  type TaxReportCollectedFromCustomers,
  type TaxReportKind,
  type TaxReportPaidToVendors,
  type TaxReportSummary,
} from "@blackbox/shared";
import { getLocalDb } from "./index";

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function toNum(value: unknown): number {
  if (value == null || value === "") return 0;
  return Number(value);
}

function dateRangeExclusiveEnd(dateTo: string): Date {
  const toExclusive = new Date(`${dateTo}T00:00:00.000Z`);
  toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
  return toExclusive;
}

type ReceiptAggRow = {
  vendorId: string | null;
  vendorName: string | null;
  month: string | null;
  receiptCount: number;
  saleTax: unknown;
  advTax: unknown;
  gst: unknown;
  credits: unknown;
};

function receiptTaxCte(vendorFilterSql: string): string {
  return `
      WITH receipt_tax AS (
        SELECT
          gr.id,
          gr.vendor_id,
          strftime('%Y-%m', gr.received_at) AS month,
          gr.tax AS h_sale,
          coalesce(gr.adv_tax, 0) AS h_adv,
          gr.gst AS h_gst,
          (coalesce(gr.incentive, 0) + coalesce(gr.shelf_rent, 0)) AS credits,
          coalesce(sum(gri.sale_tax), 0) AS l_sale,
          coalesce(sum(gri.adv_tax), 0) AS l_adv,
          coalesce(sum(gri.gst), 0) AS l_gst
        FROM goods_receipts gr
        LEFT JOIN goods_receipt_items gri
          ON gri.goods_receipt_id = gr.id AND gri.tenant_id = gr.tenant_id
        WHERE gr.tenant_id = ?
          AND gr.status = 'POSTED'
          AND gr.received_at >= ?
          AND gr.received_at < ?
          ${vendorFilterSql}
        GROUP BY gr.id, gr.vendor_id, gr.received_at, gr.tax, gr.adv_tax, gr.gst, gr.incentive, gr.shelf_rent
      )`;
}

function loadPaidToVendorsLocal(
  dateFrom: string,
  dateTo: string,
  vendorId?: string | null,
): TaxReportPaidToVendors {
  const db = getLocalDb();
  const fromIso = `${dateFrom}T00:00:00.000Z`;
  const toExclusive = dateRangeExclusiveEnd(dateTo);
  const toExclusiveIso = toExclusive.toISOString();

  const vendorFilterSql = vendorId
    ? "AND gr.vendor_id = ?"
    : "";
  const baseParams: unknown[] = vendorId
    ? [DEMO_STORE_TENANT_ID, fromIso, toExclusiveIso, vendorId]
    : [DEMO_STORE_TENANT_ID, fromIso, toExclusiveIso];

  const byVendorRows = db
    .prepare(
      `${receiptTaxCte(vendorFilterSql)}
      SELECT
        rt.vendor_id as vendorId,
        coalesce(v.name, '—') as vendorName,
        '' as month,
        count(*) as receiptCount,
        sum(rt.h_sale + rt.l_sale) as saleTax,
        sum(rt.h_adv + rt.l_adv) as advTax,
        sum(rt.h_gst + rt.l_gst) as gst,
        sum(rt.credits) as credits
      FROM receipt_tax rt
      LEFT JOIN vendors v ON v.id = rt.vendor_id AND v.tenant_id = ?
      GROUP BY rt.vendor_id, v.name
      ORDER BY vendorName`,
    )
    .all(...baseParams, DEMO_STORE_TENANT_ID) as ReceiptAggRow[];

  const byMonthRows = db
    .prepare(
      `${receiptTaxCte(vendorFilterSql)}
      SELECT
        null as vendorId,
        null as vendorName,
        rt.month,
        count(*) as receiptCount,
        sum(rt.h_sale + rt.l_sale) as saleTax,
        sum(rt.h_adv + rt.l_adv) as advTax,
        sum(rt.h_gst + rt.l_gst) as gst,
        sum(rt.credits) as credits
      FROM receipt_tax rt
      GROUP BY rt.month
      ORDER BY rt.month`,
    )
    .all(...baseParams) as ReceiptAggRow[];

  const byVendor = byVendorRows.map((r) => {
    const saleTax = round4(toNum(r.saleTax));
    const advTax = round4(toNum(r.advTax));
    const gst = round4(toNum(r.gst));
    const credits = round4(toNum(r.credits));
    return {
      vendorId: r.vendorId,
      vendorName: r.vendorName ?? "—",
      receiptCount: Number(r.receiptCount),
      saleTax,
      advTax,
      gst,
      credits,
      totalTaxPaid: round4(saleTax + advTax + gst),
    };
  });

  const byMonth = byMonthRows.map((r) => {
    const saleTax = round4(toNum(r.saleTax));
    const advTax = round4(toNum(r.advTax));
    const gst = round4(toNum(r.gst));
    const credits = round4(toNum(r.credits));
    return {
      month: r.month ?? "",
      saleTax,
      advTax,
      gst,
      credits,
      totalTaxPaid: round4(saleTax + advTax + gst),
      receiptCount: Number(r.receiptCount),
    };
  });

  const totals = byVendor.reduce(
    (acc, row) => ({
      saleTax: round4(acc.saleTax + row.saleTax),
      advTax: round4(acc.advTax + row.advTax),
      gst: round4(acc.gst + row.gst),
      credits: round4(acc.credits + row.credits),
      receiptCount: acc.receiptCount + row.receiptCount,
    }),
    { saleTax: 0, advTax: 0, gst: 0, credits: 0, receiptCount: 0 },
  );

  return {
    ...totals,
    totalTaxPaid: round4(totals.saleTax + totals.advTax + totals.gst),
    byVendor,
    byMonth,
  };
}

function loadCollectedFromCustomersLocal(
  dateFrom: string,
  dateTo: string,
): TaxReportCollectedFromCustomers {
  const db = getLocalDb();
  const fromIso = `${dateFrom}T00:00:00.000Z`;
  const toExclusive = dateRangeExclusiveEnd(dateTo);
  const toExclusiveIso = toExclusive.toISOString();
  const toExclusiveDate = toExclusive.toISOString().slice(0, 10);

  const salesRow = db
    .prepare(
      `select
         count(*) as saleCount,
         coalesce(sum(gst_amount), 0) as gst,
         coalesce(sum(sales_tax_amount), 0) as salesTax
       from sales
       where tenant_id = ?
         and status = 'POSTED'
         and posted_at >= ?
         and posted_at < ?`,
    )
    .get(DEMO_STORE_TENANT_ID, fromIso, toExclusiveIso) as
    | { saleCount: number; gst: unknown; salesTax: unknown }
    | undefined;

  const returnsRow = db
    .prepare(
      `select
         count(*) as returnCount,
         coalesce(sum(gst_amount), 0) as gst,
         coalesce(sum(sales_tax_amount), 0) as salesTax
       from sale_returns
       where tenant_id = ?
         and status in ('PENDING', 'COMPLETED')
         and return_date >= ?
         and return_date < ?`,
    )
    .get(
      DEMO_STORE_TENANT_ID,
      dateFrom,
      toExclusiveDate,
    ) as { returnCount: number; gst: unknown; salesTax: unknown } | undefined;

  const grossGst = round4(toNum(salesRow?.gst));
  const grossSalesTax = round4(toNum(salesRow?.salesTax));
  const retGst = round4(toNum(returnsRow?.gst));
  const retSalesTax = round4(toNum(returnsRow?.salesTax));

  const gross = {
    gst: grossGst,
    salesTax: grossSalesTax,
    total: round4(grossGst + grossSalesTax),
  };
  const returns = {
    gst: retGst,
    salesTax: retSalesTax,
    total: round4(retGst + retSalesTax),
  };
  const net = {
    gst: round4(grossGst - retGst),
    salesTax: round4(grossSalesTax - retSalesTax),
    total: round4(gross.total - returns.total),
  };

  return {
    gross,
    returns,
    net,
    saleCount: Number(salesRow?.saleCount ?? 0),
    returnCount: Number(returnsRow?.returnCount ?? 0),
  };
}

export function getTaxReportSummaryLocal(
  dateFrom: string,
  dateTo: string,
  vendorId?: string | null,
  taxKind: TaxReportKind = "all",
): TaxReportSummary {
  if (dateFrom > dateTo) {
    throw new Error("dateFrom must be on or before dateTo");
  }

  const paid = loadPaidToVendorsLocal(dateFrom, dateTo, vendorId ?? null);
  const collected = loadCollectedFromCustomersLocal(dateFrom, dateTo);

  return {
    dateFrom,
    dateTo,
    taxKind,
    vendorId: vendorId ?? null,
    paidToVendors: applyTaxReportPaidTaxKind(paid, taxKind),
    collectedFromCustomers: applyTaxReportCollectedTaxKind(collected, taxKind),
  };
}