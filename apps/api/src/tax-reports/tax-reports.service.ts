import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type {
  TaxReportCollectedFromCustomers,
  TaxReportKind,
  TaxReportPaidToVendors,
  TaxReportSummary,
} from "@blackbox/shared";
import { DataSource } from "typeorm";
import { FixedTenantContext } from "../inventory/common/fixed-tenant.context";

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

function applyPaidTaxKind(
  paid: TaxReportPaidToVendors,
  taxKind: TaxReportKind,
): TaxReportPaidToVendors {
  if (taxKind === "all") return paid;
  const zero = {
    saleTax: 0,
    advTax: 0,
    gst: 0,
    credits: 0,
    totalTaxPaid: 0,
  };
  const pick = (): TaxReportPaidToVendors => {
    switch (taxKind) {
      case "gst":
        return {
          ...paid,
          saleTax: 0,
          advTax: 0,
          credits: 0,
          totalTaxPaid: paid.gst,
          byVendor: paid.byVendor.map((r) => ({
            ...r,
            saleTax: 0,
            advTax: 0,
            credits: 0,
            totalTaxPaid: r.gst,
          })),
          byMonth: paid.byMonth.map((r) => ({
            ...r,
            saleTax: 0,
            advTax: 0,
            credits: 0,
            totalTaxPaid: r.gst,
          })),
        };
      case "sale_tax":
        return {
          ...paid,
          advTax: 0,
          gst: 0,
          credits: 0,
          totalTaxPaid: paid.saleTax,
          byVendor: paid.byVendor.map((r) => ({
            ...r,
            advTax: 0,
            gst: 0,
            credits: 0,
            totalTaxPaid: r.saleTax,
          })),
          byMonth: paid.byMonth.map((r) => ({
            ...r,
            advTax: 0,
            gst: 0,
            credits: 0,
            totalTaxPaid: r.saleTax,
          })),
        };
      case "adv_tax":
        return {
          ...paid,
          saleTax: 0,
          gst: 0,
          credits: 0,
          totalTaxPaid: paid.advTax,
          byVendor: paid.byVendor.map((r) => ({
            ...r,
            saleTax: 0,
            gst: 0,
            credits: 0,
            totalTaxPaid: r.advTax,
          })),
          byMonth: paid.byMonth.map((r) => ({
            ...r,
            saleTax: 0,
            gst: 0,
            credits: 0,
            totalTaxPaid: r.advTax,
          })),
        };
      case "credits":
        return {
          ...paid,
          saleTax: 0,
          advTax: 0,
          gst: 0,
          totalTaxPaid: paid.credits,
          byVendor: paid.byVendor.map((r) => ({
            ...r,
            saleTax: 0,
            advTax: 0,
            gst: 0,
            totalTaxPaid: r.credits,
          })),
          byMonth: paid.byMonth.map((r) => ({
            ...r,
            saleTax: 0,
            advTax: 0,
            gst: 0,
            totalTaxPaid: r.credits,
          })),
        };
      case "sales_tax":
        return { ...paid, ...zero, receiptCount: paid.receiptCount };
      default:
        return paid;
    }
  };
  return pick();
}

function applyCollectedTaxKind(
  collected: TaxReportCollectedFromCustomers,
  taxKind: TaxReportKind,
): TaxReportCollectedFromCustomers {
  if (taxKind === "all" || taxKind === "gst") return collected;
  if (taxKind === "sales_tax") {
    const zero = { gst: 0, salesTax: 0, total: 0 };
    return {
      ...collected,
      gross: {
        gst: 0,
        salesTax: collected.gross.salesTax,
        total: collected.gross.salesTax,
      },
      returns: {
        gst: 0,
        salesTax: collected.returns.salesTax,
        total: collected.returns.salesTax,
      },
      net: {
        gst: 0,
        salesTax: collected.net.salesTax,
        total: collected.net.salesTax,
      },
    };
  }
  // Vendor-side kinds: no customer collected amounts in focus.
  const empty = { gst: 0, salesTax: 0, total: 0 };
  return {
    ...collected,
    gross: empty,
    returns: empty,
    net: empty,
    saleCount: collected.saleCount,
    returnCount: collected.returnCount,
  };
}

@Injectable()
export class TaxReportsService {
  constructor(
    private readonly fixedTenant: FixedTenantContext,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async summary(
    dateFrom: string,
    dateTo: string,
    vendorId?: string,
    taxKind: TaxReportKind = "all",
  ): Promise<TaxReportSummary> {
    if (dateFrom > dateTo) {
      throw new BadRequestException("dateFrom must be on or before dateTo");
    }

    const tenantId = this.fixedTenant.tenantId;
    const from = new Date(`${dateFrom}T00:00:00.000Z`);
    const toExclusive = dateRangeExclusiveEnd(dateTo);

    const paid = await this.loadPaidToVendors(
      tenantId,
      from,
      toExclusive,
      vendorId,
    );
    const collected = await this.loadCollectedFromCustomers(
      tenantId,
      from,
      toExclusive,
    );

    const filteredPaid = applyPaidTaxKind(paid, taxKind);
    const filteredCollected = applyCollectedTaxKind(collected, taxKind);

    return {
      dateFrom,
      dateTo,
      taxKind,
      vendorId: vendorId ?? null,
      paidToVendors: filteredPaid,
      collectedFromCustomers: filteredCollected,
    };
  }

  private async loadPaidToVendors(
    tenantId: string,
    from: Date,
    toExclusive: Date,
    vendorId?: string,
  ): Promise<TaxReportPaidToVendors> {
    type ReceiptRow = {
      vendor_id: string | null;
      vendor_name: string | null;
      month: string;
      receipt_count: string;
      sale_tax: string;
      adv_tax: string;
      gst: string;
      credits: string;
    };

    const vendorClause = vendorId
      ? "AND gr.vendor_id = $4"
      : "AND ($4::uuid IS NULL)";
    const params: unknown[] = [tenantId, from, toExclusive, vendorId ?? null];

    const byVendorRows = await this.dataSource.query<ReceiptRow[]>(
      `
      WITH receipt_tax AS (
        SELECT
          gr.id,
          gr.vendor_id,
          to_char(gr.received_at AT TIME ZONE 'UTC', 'YYYY-MM') AS month,
          gr.tax::numeric AS h_sale,
          gr.adv_tax::numeric AS h_adv,
          gr.gst::numeric AS h_gst,
          (gr.incentive::numeric + gr.shelf_rent::numeric) AS credits,
          COALESCE(SUM(gri.sale_tax::numeric), 0) AS l_sale,
          COALESCE(SUM(gri.adv_tax::numeric), 0) AS l_adv,
          COALESCE(SUM(gri.gst::numeric), 0) AS l_gst
        FROM goods_receipts gr
        LEFT JOIN goods_receipt_items gri
          ON gri.goods_receipt_id = gr.id AND gri.tenant_id = gr.tenant_id
        WHERE gr.tenant_id = $1
          AND gr.status = 'POSTED'
          AND gr.received_at >= $2
          AND gr.received_at < $3
          ${vendorClause}
        GROUP BY gr.id, gr.vendor_id, gr.received_at, gr.tax, gr.adv_tax, gr.gst, gr.incentive, gr.shelf_rent
      )
      SELECT
        rt.vendor_id,
        COALESCE(v.name, '—') AS vendor_name,
        '' AS month,
        COUNT(*)::text AS receipt_count,
        SUM(rt.h_sale + rt.l_sale)::text AS sale_tax,
        SUM(rt.h_adv + rt.l_adv)::text AS adv_tax,
        SUM(rt.h_gst + rt.l_gst)::text AS gst,
        SUM(rt.credits)::text AS credits
      FROM receipt_tax rt
      LEFT JOIN vendors v ON v.id = rt.vendor_id AND v.tenant_id = $1
      GROUP BY rt.vendor_id, v.name
      ORDER BY vendor_name
      `,
      params,
    );

    const byMonthRows = await this.dataSource.query<ReceiptRow[]>(
      `
      WITH receipt_tax AS (
        SELECT
          gr.id,
          to_char(gr.received_at AT TIME ZONE 'UTC', 'YYYY-MM') AS month,
          gr.tax::numeric AS h_sale,
          gr.adv_tax::numeric AS h_adv,
          gr.gst::numeric AS h_gst,
          (gr.incentive::numeric + gr.shelf_rent::numeric) AS credits,
          COALESCE(SUM(gri.sale_tax::numeric), 0) AS l_sale,
          COALESCE(SUM(gri.adv_tax::numeric), 0) AS l_adv,
          COALESCE(SUM(gri.gst::numeric), 0) AS l_gst
        FROM goods_receipts gr
        LEFT JOIN goods_receipt_items gri
          ON gri.goods_receipt_id = gr.id AND gri.tenant_id = gr.tenant_id
        WHERE gr.tenant_id = $1
          AND gr.status = 'POSTED'
          AND gr.received_at >= $2
          AND gr.received_at < $3
          ${vendorClause}
        GROUP BY gr.id, gr.received_at, gr.tax, gr.adv_tax, gr.gst, gr.incentive, gr.shelf_rent
      )
      SELECT
        NULL AS vendor_id,
        NULL AS vendor_name,
        rt.month,
        COUNT(*)::text AS receipt_count,
        SUM(rt.h_sale + rt.l_sale)::text AS sale_tax,
        SUM(rt.h_adv + rt.l_adv)::text AS adv_tax,
        SUM(rt.h_gst + rt.l_gst)::text AS gst,
        SUM(rt.credits)::text AS credits
      FROM receipt_tax rt
      GROUP BY rt.month
      ORDER BY rt.month
      `,
      params,
    );

    const byVendor = byVendorRows.map((r) => {
      const saleTax = round4(toNum(r.sale_tax));
      const advTax = round4(toNum(r.adv_tax));
      const gst = round4(toNum(r.gst));
      const credits = round4(toNum(r.credits));
      return {
        vendorId: r.vendor_id,
        vendorName: r.vendor_name ?? "—",
        receiptCount: Number(r.receipt_count),
        saleTax,
        advTax,
        gst,
        credits,
        totalTaxPaid: round4(saleTax + advTax + gst),
      };
    });

    const byMonth = byMonthRows.map((r) => {
      const saleTax = round4(toNum(r.sale_tax));
      const advTax = round4(toNum(r.adv_tax));
      const gst = round4(toNum(r.gst));
      const credits = round4(toNum(r.credits));
      return {
        month: r.month,
        saleTax,
        advTax,
        gst,
        credits,
        totalTaxPaid: round4(saleTax + advTax + gst),
        receiptCount: Number(r.receipt_count),
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

  private async loadCollectedFromCustomers(
    tenantId: string,
    from: Date,
    toExclusive: Date,
  ): Promise<TaxReportCollectedFromCustomers> {
    const [salesRow] = await this.dataSource.query<
      Array<{
        sale_count: string;
        gst: string;
        sales_tax: string;
      }>
    >(
      `
      SELECT
        COUNT(*)::text AS sale_count,
        COALESCE(SUM(gst_amount::numeric), 0)::text AS gst,
        COALESCE(SUM(sales_tax_amount::numeric), 0)::text AS sales_tax
      FROM sales
      WHERE tenant_id = $1
        AND status = 'POSTED'
        AND posted_at >= $2
        AND posted_at < $3
      `,
      [tenantId, from, toExclusive],
    );

    const [returnsRow] = await this.dataSource.query<
      Array<{
        return_count: string;
        gst: string;
        sales_tax: string;
      }>
    >(
      `
      SELECT
        COUNT(*)::text AS return_count,
        COALESCE(SUM(gst_amount::numeric), 0)::text AS gst,
        COALESCE(SUM(sales_tax_amount::numeric), 0)::text AS sales_tax
      FROM sale_returns
      WHERE tenant_id = $1
        AND status IN ('PENDING', 'COMPLETED')
        AND return_date >= $2::date
        AND return_date < $3::date
      `,
      [tenantId, from.toISOString().slice(0, 10), toExclusive.toISOString().slice(0, 10)],
    );

    const grossGst = round4(toNum(salesRow?.gst));
    const grossSalesTax = round4(toNum(salesRow?.sales_tax));
    const retGst = round4(toNum(returnsRow?.gst));
    const retSalesTax = round4(toNum(returnsRow?.sales_tax));

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
      saleCount: Number(salesRow?.sale_count ?? 0),
      returnCount: Number(returnsRow?.return_count ?? 0),
    };
  }
}
