import { useEffect, useMemo, useState } from "react";
import type {
  InventoryInOutDirection,
  InventoryInOutPeriodInput,
  InventoryInOutPeriodMode,
  InventoryInOutReport,
  InventoryInOutReportClientFilters,
  InventoryMovementListItem,
  VendorListItem,
  WarehouseListItem,
} from "@blackbox/shared";
import {
  DEFAULT_INVENTORY_IN_OUT_PERIOD,
  DEFAULT_INVENTORY_IN_OUT_REPORT_FILTERS,
  applyInventoryInOutReportFilters,
  buildInventoryInOutReportCsv,
  inventoryInOutReportCsvFilename,
  resolveInventoryInOutReportRange,
} from "@blackbox/shared";
import { Button } from "@blackbox/ui/button";
import { Input } from "@blackbox/ui/input";
import { Label } from "@blackbox/ui/label";
import { SearchableMultiSelect } from "@blackbox/ui/searchable-multi-select";
import { ListTableRow } from "@renderer/components/list-table-row";
import {
  FILTER_SELECT_CLASS,
  ListFilterNav,
  filterDateProps,
  filterSelectProps,
} from "@renderer/components/list-filter-nav";
import { PrintButton } from "@renderer/components/print-button";
import { PrintDocument } from "@renderer/components/print-document";
import { getApiErrorMessage } from "@renderer/lib/api/client";
import { downloadTextFile } from "@renderer/lib/download-file";
import {
  loadInventoryInOutReport,
  loadProducts,
  loadSkuSearch,
  loadVendors,
  loadWarehouses,
} from "@renderer/lib/local-db/entity-source";

function emptyReport(dateFrom: string, dateTo: string): InventoryInOutReport {
  return {
    dateFrom,
    dateTo,
    inbound: { items: [], quantityTotal: 0, lineCount: 0 },
    outbound: { items: [], quantityTotal: 0, lineCount: 0 },
    byDay: [],
  };
}

export function InventoryInOutReportPage() {
  const [period, setPeriod] = useState<InventoryInOutPeriodInput>(
    DEFAULT_INVENTORY_IN_OUT_PERIOD,
  );
  const [filters, setFilters] = useState<InventoryInOutReportClientFilters>(
    DEFAULT_INVENTORY_IN_OUT_REPORT_FILTERS,
  );
  const [vendors, setVendors] = useState<VendorListItem[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseListItem[]>([]);
  const [report, setReport] = useState<InventoryInOutReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [periodError, setPeriodError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const resolvedRange = useMemo(
    () => resolveInventoryInOutReportRange(period),
    [period],
  );

  const range =
    "error" in resolvedRange
      ? null
      : { dateFrom: resolvedRange.dateFrom, dateTo: resolvedRange.dateTo };

  useEffect(() => {
    void loadVendors({ status: "active", pageSize: 100 })
      .then((r) => setVendors(r.items))
      .catch(() => undefined);
    void loadWarehouses()
      .then(setWarehouses)
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
    void loadInventoryInOutReport(resolvedRange.dateFrom, resolvedRange.dateTo)
      .then((data) => {
        if (!cancelled) setReport(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setReport(
            emptyReport(resolvedRange.dateFrom, resolvedRange.dateTo),
          );
          setError(getApiErrorMessage(err, "Failed to load report"));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [resolvedRange]);

  const data =
    report ??
    (range
      ? emptyReport(range.dateFrom, range.dateTo)
      : emptyReport(
          DEFAULT_INVENTORY_IN_OUT_PERIOD.dateFrom,
          DEFAULT_INVENTORY_IN_OUT_PERIOD.dateTo,
        ));
  const filteredReport = useMemo(
    () => applyInventoryInOutReportFilters(data, filters),
    [data, filters],
  );
  const rangeLabel = range
    ? range.dateFrom === range.dateTo
      ? range.dateFrom
      : `${range.dateFrom} – ${range.dateTo}`
    : "—";
  const vendorOptions = useMemo(
    () => vendors.map((vendor) => ({ value: vendor.id, label: vendor.name })),
    [vendors],
  );

  function patchPeriod(patch: Partial<InventoryInOutPeriodInput>) {
    setPeriod((prev) => ({ ...prev, ...patch }));
  }

  function patchFilters(patch: Partial<InventoryInOutReportClientFilters>) {
    setFilters((prev) => ({ ...prev, ...patch }));
  }

  async function handleDownloadCsv() {
    if (downloading) return;
    setDownloading(true);
    try {
      const csv = buildInventoryInOutReportCsv(filteredReport, filters.direction);
      const filename = inventoryInOutReportCsvFilename(
        filteredReport.dateFrom,
        filteredReport.dateTo,
      );
      await downloadTextFile(filename, csv);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Inventory in / out
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Receipts (in) and inventory out for a date, month, or year range.
          </p>
        </div>
        {!loading && !periodError ? (
          <div className="no-print flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={downloading}
              onClick={() => void handleDownloadCsv()}
            >
              {downloading ? "Downloading…" : "Download CSV"}
            </Button>
            <PrintButton />
          </div>
        ) : null}
      </div>

      <div className="no-print flex flex-wrap items-end gap-4">
        <div className="flex gap-2">
          {(["date", "month", "year"] as InventoryInOutPeriodMode[]).map(
            (m) => (
              <Button
                key={m}
                type="button"
                variant={period.mode === m ? "default" : "outline"}
                size="sm"
                onClick={() => patchPeriod({ mode: m })}
              >
                {m === "date" ? "Date" : m === "month" ? "Month" : "Year"}
              </Button>
            ),
          )}
        </div>
        {period.mode === "date" ? (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="report-date-from">From</Label>
              <Input
                id="report-date-from"
                type="date"
                className="w-44"
                {...filterDateProps()}
                value={period.dateFrom}
                onChange={(e) => patchPeriod({ dateFrom: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="report-date-to">To</Label>
              <Input
                id="report-date-to"
                type="date"
                className="w-44"
                {...filterDateProps()}
                value={period.dateTo}
                onChange={(e) => patchPeriod({ dateTo: e.target.value })}
              />
            </div>
          </>
        ) : null}
        {period.mode === "month" ? (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="report-month-from">From</Label>
              <Input
                id="report-month-from"
                type="month"
                className="w-44"
                {...filterDateProps()}
                value={period.monthFrom}
                onChange={(e) => patchPeriod({ monthFrom: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="report-month-to">To</Label>
              <Input
                id="report-month-to"
                type="month"
                className="w-44"
                {...filterDateProps()}
                value={period.monthTo}
                onChange={(e) => patchPeriod({ monthTo: e.target.value })}
              />
            </div>
          </>
        ) : null}
        {period.mode === "year" ? (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="report-year-from">From</Label>
              <Input
                id="report-year-from"
                type="number"
                min={2000}
                max={2100}
                className="w-28"
                value={period.yearFrom}
                onChange={(e) => patchPeriod({ yearFrom: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="report-year-to">To</Label>
              <Input
                id="report-year-to"
                type="number"
                min={2000}
                max={2100}
                className="w-28"
                value={period.yearTo}
                onChange={(e) => patchPeriod({ yearTo: e.target.value })}
              />
            </div>
          </>
        ) : null}
      </div>

      <ListFilterNav className="no-print flex-wrap">
        <select
          className={FILTER_SELECT_CLASS}
          {...filterSelectProps()}
          value={filters.direction}
          onChange={(e) =>
            patchFilters({
              direction: e.target.value as InventoryInOutDirection,
            })
          }
        >
          <option value="both">In and out</option>
          <option value="in">In only</option>
          <option value="out">Out only</option>
        </select>
        <SearchableMultiSelect
          placeholder="SKU"
          selected={filters.productSkuIds}
          onSelectedChange={(productSkuIds) =>
            patchFilters({ productSkuIds })
          }
          loadOptions={async (query) => {
            const rows = await loadSkuSearch(query);
            return rows.map((row) => ({
              value: row.id,
              label: `${row.sku} · ${row.variantName}`,
              keywords: `${row.sku} ${row.variantName} ${row.productName}`,
            }));
          }}
        />
        <SearchableMultiSelect
          placeholder="Product"
          selected={filters.productIds}
          onSelectedChange={(productIds) => patchFilters({ productIds })}
          loadOptions={async (query) => {
            const result = await loadProducts({
              search: query,
              pageSize: 50,
              status: "active",
            });
            return result.items.map((product) => ({
              value: product.id,
              label: product.name,
              keywords: `${product.name} ${product.productCode}`,
            }));
          }}
        />
        <SearchableMultiSelect
          placeholder="Vendor"
          selected={filters.vendorIds}
          onSelectedChange={(vendorIds) => patchFilters({ vendorIds })}
          options={vendorOptions}
        />
        <select
          className={FILTER_SELECT_CLASS}
          {...filterSelectProps()}
          value={filters.warehouseId}
          onChange={(e) => patchFilters({ warehouseId: e.target.value })}
        >
          <option value="">All warehouses</option>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <Input
          type="number"
          min={0}
          className="w-24"
          placeholder="Qty min"
          value={filters.qtyMin}
          onChange={(e) => patchFilters({ qtyMin: e.target.value })}
        />
        <Input
          type="number"
          min={0}
          className="w-24"
          placeholder="Qty max"
          value={filters.qtyMax}
          onChange={(e) => patchFilters({ qtyMax: e.target.value })}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setFilters(DEFAULT_INVENTORY_IN_OUT_REPORT_FILTERS)}
        >
          Clear filters
        </Button>
      </ListFilterNav>

      {periodError ? (
        <div
          role="alert"
          className="border-destructive/40 bg-destructive/5 text-destructive rounded-lg border px-4 py-3 text-sm"
        >
          {periodError}
        </div>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="border-destructive/40 bg-destructive/5 text-destructive rounded-lg border px-4 py-3 text-sm"
        >
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : periodError ? null : (
        <PrintDocument>
          <p className="text-muted-foreground text-sm print:text-black">
            Period: {rangeLabel}
          </p>
          <DayTables
            report={filteredReport}
            direction={filters.direction}
          />
        </PrintDocument>
      )}
    </div>
  );
}

function Totals({
  report,
  direction,
}: {
  report: InventoryInOutReport;
  direction: InventoryInOutDirection;
}) {
  const showIn = direction === "both" || direction === "in";
  const showOut = direction === "both" || direction === "out";
  const cols =
    showIn && showOut ? "sm:grid-cols-2" : "sm:grid-cols-1 max-w-xs";

  return (
    <section className={`grid gap-3 text-sm ${cols}`}>
      {showIn ? (
        <div className="border-border rounded-lg border px-4 py-3">
          <div className="text-muted-foreground">In total</div>
          <div className="mt-1 text-lg font-medium tabular-nums">
            {report.inbound.quantityTotal.toLocaleString()}
          </div>
          <div className="text-muted-foreground text-xs">
            {report.inbound.lineCount} line
            {report.inbound.lineCount === 1 ? "" : "s"}
          </div>
        </div>
      ) : null}
      {showOut ? (
        <div className="border-border rounded-lg border px-4 py-3">
          <div className="text-muted-foreground">Out total</div>
          <div className="mt-1 text-lg font-medium tabular-nums">
            {report.outbound.quantityTotal.toLocaleString()}
          </div>
          <div className="text-muted-foreground text-xs">
            {report.outbound.lineCount} line
            {report.outbound.lineCount === 1 ? "" : "s"}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function MovementTable({
  title,
  items,
}: {
  title: string;
  items: InventoryMovementListItem[];
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-medium">{title}</h2>
      <div className="border-border overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Time</th>
              <th className="px-4 py-3 font-medium">Product</th>
              <th className="px-4 py-3 font-medium">SKU</th>
              <th className="px-4 py-3 font-medium">Vendor</th>
              <th className="px-4 py-3 font-medium">Warehouse</th>
              <th className="px-4 py-3 font-medium">Qty</th>
              <th className="px-4 py-3 font-medium">Reason</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr className="border-border border-t">
                <td
                  colSpan={7}
                  className="text-muted-foreground px-4 py-6 text-center"
                >
                  No movements match filters.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <ListTableRow key={item.id}>
                  <td className="px-4 py-3 tabular-nums">
                    {item.createdAt.replace("T", " ").slice(0, 19)}
                  </td>
                  <td className="px-4 py-3">{item.productName || "—"}</td>
                  <td className="px-4 py-3">
                    {item.sku}
                    {item.variantName ? (
                      <span className="text-muted-foreground">
                        {" "}
                        · {item.variantName}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">{item.vendorName || "—"}</td>
                  <td className="px-4 py-3">{item.warehouseName}</td>
                  <td className="px-4 py-3 tabular-nums">{item.quantity}</td>
                  <td className="px-4 py-3">{item.reason || "—"}</td>
                </ListTableRow>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DayTables({
  report,
  direction,
}: {
  report: InventoryInOutReport;
  direction: InventoryInOutDirection;
}) {
  const showIn = direction === "both" || direction === "in";
  const showOut = direction === "both" || direction === "out";

  return (
    <div className="space-y-8">
      <Totals report={report} direction={direction} />
      {showIn ? (
        <MovementTable title="Inventory in" items={report.inbound.items} />
      ) : null}
      {showOut ? (
        <MovementTable title="Inventory out" items={report.outbound.items} />
      ) : null}
    </div>
  );
}
