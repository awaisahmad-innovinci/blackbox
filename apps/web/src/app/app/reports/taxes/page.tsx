"use client";

import { useEffect, useMemo, useState } from "react";
import type { TaxReportKind, TaxReportPeriodInput, TaxReportSummary } from "@blackbox/shared";
import {
  DEFAULT_TAX_REPORT_PERIOD,
  TAX_REPORT_KINDS,
  buildTaxReportCsv,
  resolveTaxReportRange,
  taxReportCsvFilename,
} from "@blackbox/shared";
import { Button } from "@blackbox/ui/button";
import { Input } from "@blackbox/ui/input";
import { Label } from "@blackbox/ui/label";
import { PageHeader } from "@/components/page-header";
import { LoadingState, PageError } from "@/components/page-state";
import { RequirePermission } from "@/components/require-permission";
import { listVendors, type VendorListItemDto } from "@/lib/admin-api";
import { downloadTextFile } from "@/lib/download-file";
import { getTaxReportSummary } from "@/lib/tax-reports";

const FILTER_SELECT_CLASS =
  "border-input bg-background h-9 rounded-md border px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

const TAX_KIND_LABELS: Record<TaxReportKind, string> = {
  all: "All taxes",
  gst: "GST only",
  sale_tax: "Sale tax (vendor)",
  adv_tax: "Adv tax",
  sales_tax: "Sales tax (customer)",
  credits: "Vendor credits",
};

function formatMoney(n: number): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });
}

export default function TaxReportsPage() {
  const [period, setPeriod] = useState<TaxReportPeriodInput>(
    DEFAULT_TAX_REPORT_PERIOD,
  );
  const [vendorId, setVendorId] = useState("");
  const [taxKind, setTaxKind] = useState<TaxReportKind>("all");
  const [vendors, setVendors] = useState<VendorListItemDto[]>([]);
  const [report, setReport] = useState<TaxReportSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [periodError, setPeriodError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const resolvedRange = useMemo(
    () => resolveTaxReportRange(period),
    [period],
  );

  useEffect(() => {
    void listVendors({ status: "active", pageSize: 200 })
      .then((r) => setVendors(r.items))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if ("error" in resolvedRange) {
      setPeriodError(resolvedRange.error);
      setLoading(false);
      return;
    }
    setPeriodError(null);
    let cancelled = false;
    setLoading(true);
    setError(null);
    void getTaxReportSummary({
      dateFrom: resolvedRange.dateFrom,
      dateTo: resolvedRange.dateTo,
      vendorId: vendorId || undefined,
      taxKind,
    })
      .then((data) => {
        if (!cancelled) setReport(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [resolvedRange, vendorId, taxKind]);

  const rangeLabel =
    report != null
      ? report.dateFrom === report.dateTo
        ? report.dateFrom
        : `${report.dateFrom} – ${report.dateTo}`
      : "—";

  async function handleDownloadCsv() {
    if (!report || downloading) return;
    setDownloading(true);
    try {
      const csv = buildTaxReportCsv(report);
      await downloadTextFile(
        taxReportCsvFilename(report.dateFrom, report.dateTo),
        csv,
      );
    } finally {
      setDownloading(false);
    }
  }

  return (
    <RequirePermission permissions={["tax.reports.read"]}>
      <div className="space-y-8">
        <PageHeader
          title="Tax report"
          description="Taxes paid to vendors on posted purchase vouchers and taxes collected from customers on posted sales (net of returns)."
          actions={
            report && !loading && !periodError ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={downloading}
                onClick={() => void handleDownloadCsv()}
              >
                {downloading ? "Downloading…" : "Download CSV"}
              </Button>
            ) : null
          }
        />

        <div className="flex flex-wrap items-end gap-4">
          <div className="flex gap-2">
            {(["date", "month", "year"] as const).map((m) => (
              <Button
                key={m}
                type="button"
                variant={period.mode === m ? "default" : "outline"}
                size="sm"
                onClick={() => setPeriod((prev) => ({ ...prev, mode: m }))}
              >
                {m === "date" ? "Date" : m === "month" ? "Month" : "Year"}
              </Button>
            ))}
          </div>
          {period.mode === "date" ? (
            <>
              <div className="space-y-1">
                <Label htmlFor="taxFrom">From</Label>
                <Input
                  id="taxFrom"
                  type="date"
                  className="w-auto"
                  value={period.dateFrom}
                  onChange={(e) =>
                    setPeriod((p) => ({ ...p, dateFrom: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="taxTo">To</Label>
                <Input
                  id="taxTo"
                  type="date"
                  className="w-auto"
                  value={period.dateTo}
                  onChange={(e) =>
                    setPeriod((p) => ({ ...p, dateTo: e.target.value }))
                  }
                />
              </div>
            </>
          ) : period.mode === "month" ? (
            <>
              <div className="space-y-1">
                <Label htmlFor="taxMonthFrom">From month</Label>
                <Input
                  id="taxMonthFrom"
                  type="month"
                  className="w-auto"
                  value={period.monthFrom}
                  onChange={(e) =>
                    setPeriod((p) => ({ ...p, monthFrom: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="taxMonthTo">To month</Label>
                <Input
                  id="taxMonthTo"
                  type="month"
                  className="w-auto"
                  value={period.monthTo}
                  onChange={(e) =>
                    setPeriod((p) => ({ ...p, monthTo: e.target.value }))
                  }
                />
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1">
                <Label htmlFor="taxYearFrom">From year</Label>
                <Input
                  id="taxYearFrom"
                  type="number"
                  className="w-28"
                  min={2000}
                  max={2100}
                  value={period.yearFrom}
                  onChange={(e) =>
                    setPeriod((p) => ({ ...p, yearFrom: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="taxYearTo">To year</Label>
                <Input
                  id="taxYearTo"
                  type="number"
                  className="w-28"
                  min={2000}
                  max={2100}
                  value={period.yearTo}
                  onChange={(e) =>
                    setPeriod((p) => ({ ...p, yearTo: e.target.value }))
                  }
                />
              </div>
            </>
          )}

          <div className="space-y-1">
            <Label htmlFor="taxVendor">Vendor (paid side)</Label>
            <select
              id="taxVendor"
              className={FILTER_SELECT_CLASS}
              value={vendorId}
              onChange={(e) => setVendorId(e.target.value)}
            >
              <option value="">All vendors</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="taxKind">Tax type</Label>
            <select
              id="taxKind"
              className={FILTER_SELECT_CLASS}
              value={taxKind}
              onChange={(e) => setTaxKind(e.target.value as TaxReportKind)}
            >
              {TAX_REPORT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {TAX_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {periodError ? (
          <p className="text-destructive text-sm">{periodError}</p>
        ) : null}

        {loading ? <LoadingState label="Loading tax report…" /> : null}
        {!loading && error ? <PageError error={error} /> : null}

        {!loading && !periodError && report ? (
          <>
            <p className="text-muted-foreground text-sm">Period: {rangeLabel}</p>

            <div className="grid gap-4 md:grid-cols-2">
              <section className="border-border space-y-3 rounded-lg border p-4">
                <h2 className="text-lg font-semibold">Paid to vendors</h2>
                <p className="text-muted-foreground text-xs">
                  Posted goods receipts ({report.paidToVendors.receiptCount}{" "}
                  vouchers)
                </p>
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <dt className="text-muted-foreground">Sale tax</dt>
                  <dd className="text-right tabular-nums">
                    {formatMoney(report.paidToVendors.saleTax)}
                  </dd>
                  <dt className="text-muted-foreground">Adv tax</dt>
                  <dd className="text-right tabular-nums">
                    {formatMoney(report.paidToVendors.advTax)}
                  </dd>
                  <dt className="text-muted-foreground">GST</dt>
                  <dd className="text-right tabular-nums">
                    {formatMoney(report.paidToVendors.gst)}
                  </dd>
                  <dt className="text-muted-foreground">Credits</dt>
                  <dd className="text-right tabular-nums">
                    {formatMoney(report.paidToVendors.credits)}
                  </dd>
                  <dt className="font-medium">Total tax paid</dt>
                  <dd className="text-right font-medium tabular-nums">
                    {formatMoney(report.paidToVendors.totalTaxPaid)}
                  </dd>
                </dl>
              </section>

              <section className="border-border space-y-3 rounded-lg border p-4">
                <h2 className="text-lg font-semibold">Collected from customers</h2>
                <p className="text-muted-foreground text-xs">
                  {report.collectedFromCustomers.saleCount} sales,{" "}
                  {report.collectedFromCustomers.returnCount} returns
                </p>
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <dt className="text-muted-foreground">GST (gross)</dt>
                  <dd className="text-right tabular-nums">
                    {formatMoney(report.collectedFromCustomers.gross.gst)}
                  </dd>
                  <dt className="text-muted-foreground">Sales tax (gross)</dt>
                  <dd className="text-right tabular-nums">
                    {formatMoney(report.collectedFromCustomers.gross.salesTax)}
                  </dd>
                  <dt className="text-muted-foreground">Returns (tax)</dt>
                  <dd className="text-right tabular-nums">
                    −{formatMoney(report.collectedFromCustomers.returns.total)}
                  </dd>
                  <dt className="font-medium">Net collected</dt>
                  <dd className="text-right font-medium tabular-nums">
                    {formatMoney(report.collectedFromCustomers.net.total)}
                  </dd>
                </dl>
              </section>
            </div>

            {report.paidToVendors.byVendor.length > 0 ? (
              <div className="border-border overflow-auto rounded-lg border">
                <table className="w-full text-left text-sm">
                  <thead className="bg-muted/40 text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Vendor</th>
                      <th className="px-3 py-2 font-medium text-right">Vouchers</th>
                      <th className="px-3 py-2 font-medium text-right">Sale tax</th>
                      <th className="px-3 py-2 font-medium text-right">Adv tax</th>
                      <th className="px-3 py-2 font-medium text-right">GST</th>
                      <th className="px-3 py-2 font-medium text-right">Credits</th>
                      <th className="px-3 py-2 font-medium text-right">Total tax</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.paidToVendors.byVendor.map((row) => (
                      <tr key={row.vendorId ?? row.vendorName} className="border-t">
                        <td className="px-3 py-2">{row.vendorName}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {row.receiptCount}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatMoney(row.saleTax)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatMoney(row.advTax)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatMoney(row.gst)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatMoney(row.credits)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">
                          {formatMoney(row.totalTaxPaid)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {report.paidToVendors.byMonth.length > 1 ? (
              <div className="border-border overflow-auto rounded-lg border">
                <table className="w-full text-left text-sm">
                  <thead className="bg-muted/40 text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Month</th>
                      <th className="px-3 py-2 font-medium text-right">Vouchers</th>
                      <th className="px-3 py-2 font-medium text-right">Total tax paid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.paidToVendors.byMonth.map((row) => (
                      <tr key={row.month} className="border-t">
                        <td className="px-3 py-2">{row.month}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {row.receiptCount}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatMoney(row.totalTaxPaid)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </RequirePermission>
  );
}
