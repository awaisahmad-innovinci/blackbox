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
import {
  FILTER_SELECT_CLASS,
  filterDateProps,
  filterSelectProps,
} from "@renderer/components/list-filter-nav";
import { getApiErrorMessage } from "@renderer/lib/api/client";
import { taxReportsApi } from "@renderer/lib/api/tax-reports";
import { downloadTextFile } from "@renderer/lib/download-file";
import { loadVendors } from "@renderer/lib/local-db/entity-source";

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

export function TaxReportPage() {
  const [period, setPeriod] = useState<TaxReportPeriodInput>(
    DEFAULT_TAX_REPORT_PERIOD,
  );
  const [vendorId, setVendorId] = useState("");
  const [taxKind, setTaxKind] = useState<TaxReportKind>("all");
  const [vendors, setVendors] = useState<{ id: string; name: string }[]>([]);
  const [report, setReport] = useState<TaxReportSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [periodError, setPeriodError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const resolvedRange = useMemo(
    () => resolveTaxReportRange(period),
    [period],
  );

  useEffect(() => {
    void loadVendors({ status: "active", page: 1, pageSize: 200 })
      .then((r) => setVendors(r.items.map((v) => ({ id: v.id, name: v.name }))))
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
    void taxReportsApi
      .summary({
        dateFrom: resolvedRange.dateFrom,
        dateTo: resolvedRange.dateTo,
        vendorId: vendorId || undefined,
        taxKind,
      })
      .then((data) => {
        if (!cancelled) setReport(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setReport(null);
          setError(getApiErrorMessage(err, "Could not load tax report"));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [resolvedRange, vendorId, taxKind]);

  async function handleDownloadCsv() {
    if (!report || downloading) return;
    setDownloading(true);
    try {
      await downloadTextFile(
        taxReportCsvFilename(report.dateFrom, report.dateTo),
        buildTaxReportCsv(report),
      );
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tax report</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Taxes paid on posted purchase vouchers and collected on posted sales
            (net of returns). Requires connection to the cloud API.
          </p>
        </div>
        {report && !loading && !periodError ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={downloading}
            onClick={() => void handleDownloadCsv()}
          >
            {downloading ? "Downloading…" : "Download CSV"}
          </Button>
        ) : null}
      </div>

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
              <Label>From</Label>
              <Input
                type="date"
                className="w-auto"
                {...filterDateProps()}
                value={period.dateFrom}
                onChange={(e) =>
                  setPeriod((p) => ({ ...p, dateFrom: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label>To</Label>
              <Input
                type="date"
                className="w-auto"
                {...filterDateProps()}
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
              <Label>From month</Label>
              <Input
                type="month"
                className="w-auto"
                value={period.monthFrom}
                onChange={(e) =>
                  setPeriod((p) => ({ ...p, monthFrom: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label>To month</Label>
              <Input
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
              <Label>From year</Label>
              <Input
                type="number"
                className="w-28"
                value={period.yearFrom}
                onChange={(e) =>
                  setPeriod((p) => ({ ...p, yearFrom: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label>To year</Label>
              <Input
                type="number"
                className="w-28"
                value={period.yearTo}
                onChange={(e) =>
                  setPeriod((p) => ({ ...p, yearTo: e.target.value }))
                }
              />
            </div>
          </>
        )}

        <div className="space-y-1">
          <Label>Vendor</Label>
          <select
            className={FILTER_SELECT_CLASS}
            {...filterSelectProps()}
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
          <Label>Tax type</Label>
          <select
            className={FILTER_SELECT_CLASS}
            {...filterSelectProps()}
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
      {loading ? (
        <p className="text-muted-foreground text-sm">Loading tax report…</p>
      ) : null}
      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      {!loading && !periodError && report ? (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <section className="border-border space-y-3 rounded-lg border p-4">
              <h2 className="text-lg font-semibold">Paid to vendors</h2>
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
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <dt className="text-muted-foreground">Net GST</dt>
                <dd className="text-right tabular-nums">
                  {formatMoney(report.collectedFromCustomers.net.gst)}
                </dd>
                <dt className="text-muted-foreground">Net sales tax</dt>
                <dd className="text-right tabular-nums">
                  {formatMoney(report.collectedFromCustomers.net.salesTax)}
                </dd>
                <dt className="font-medium">Net total</dt>
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
                    <th className="px-3 py-2 text-right font-medium">Total tax</th>
                  </tr>
                </thead>
                <tbody>
                  {report.paidToVendors.byVendor.map((row) => (
                    <tr key={row.vendorId ?? row.vendorName} className="border-t">
                      <td className="px-3 py-2">{row.vendorName}</td>
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
  );
}
