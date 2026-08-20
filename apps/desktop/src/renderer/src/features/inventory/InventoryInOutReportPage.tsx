import { useEffect, useMemo, useState } from "react";
import type {
  InventoryInOutReport,
  InventoryMovementListItem,
} from "@blackbox/shared";
import { Button } from "@blackbox/ui/button";
import { Input } from "@blackbox/ui/input";
import { Label } from "@blackbox/ui/label";
import { getApiErrorMessage } from "@renderer/lib/api/client";
import { loadInventoryInOutReport } from "@renderer/lib/local-db/entity-source";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function thisMonth(): string {
  return todayIso().slice(0, 7);
}

function monthRange(ym: string): { dateFrom: string; dateTo: string } {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return {
    dateFrom: `${y}-${mm}-01`,
    dateTo: `${y}-${mm}-${String(last).padStart(2, "0")}`,
  };
}

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
  const [mode, setMode] = useState<"day" | "month">("day");
  const [day, setDay] = useState(todayIso);
  const [month, setMonth] = useState(thisMonth);
  const [report, setReport] = useState<InventoryInOutReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(
    () => (mode === "day" ? { dateFrom: day, dateTo: day } : monthRange(month)),
    [mode, day, month],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void loadInventoryInOutReport(range.dateFrom, range.dateTo)
      .then((data) => {
        if (!cancelled) setReport(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setReport(emptyReport(range.dateFrom, range.dateTo));
          setError(getApiErrorMessage(err, "Failed to load report"));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range.dateFrom, range.dateTo]);

  const data = report ?? emptyReport(range.dateFrom, range.dateTo);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Inventory in / out
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Receipts (in) and inventory out for a day or a full month.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="flex gap-2">
          <Button
            type="button"
            variant={mode === "day" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("day")}
          >
            Day
          </Button>
          <Button
            type="button"
            variant={mode === "month" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("month")}
          >
            Month
          </Button>
        </div>
        {mode === "day" ? (
          <div className="space-y-1.5">
            <Label htmlFor="report-day">Date</Label>
            <Input
              id="report-day"
              type="date"
              className="w-44"
              value={day}
              onChange={(e) => setDay(e.target.value)}
            />
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="report-month">Month</Label>
            <Input
              id="report-month"
              type="month"
              className="w-44"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </div>
        )}
      </div>

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
      ) : mode === "month" ? (
        <MonthTable
          report={data}
          onOpenDay={(date) => {
            setDay(date);
            setMode("day");
          }}
        />
      ) : (
        <DayTables report={data} />
      )}
    </div>
  );
}

function Totals({ report }: { report: InventoryInOutReport }) {
  return (
    <section className="grid gap-3 text-sm sm:grid-cols-2">
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
              <th className="px-4 py-3 font-medium">SKU</th>
              <th className="px-4 py-3 font-medium">Warehouse</th>
              <th className="px-4 py-3 font-medium">Qty</th>
              <th className="px-4 py-3 font-medium">Reason</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr className="border-border border-t">
                <td
                  colSpan={5}
                  className="text-muted-foreground px-4 py-6 text-center"
                >
                  No movements.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="border-border border-t">
                  <td className="px-4 py-3 tabular-nums">
                    {item.createdAt.replace("T", " ").slice(0, 19)}
                  </td>
                  <td className="px-4 py-3">
                    {item.sku}
                    {item.variantName ? (
                      <span className="text-muted-foreground">
                        {" "}
                        · {item.variantName}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">{item.warehouseName}</td>
                  <td className="px-4 py-3 tabular-nums">{item.quantity}</td>
                  <td className="px-4 py-3">{item.reason || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DayTables({ report }: { report: InventoryInOutReport }) {
  return (
    <div className="space-y-8">
      <Totals report={report} />
      <MovementTable title="Inventory in" items={report.inbound.items} />
      <MovementTable title="Inventory out" items={report.outbound.items} />
    </div>
  );
}

function MonthTable({
  report,
  onOpenDay,
}: {
  report: InventoryInOutReport;
  onOpenDay: (date: string) => void;
}) {
  return (
    <div className="space-y-6">
      <Totals report={report} />
      <div className="border-border overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">In qty</th>
              <th className="px-4 py-3 font-medium">Out qty</th>
            </tr>
          </thead>
          <tbody>
            {report.byDay.map((row) => (
              <tr key={row.date} className="border-border border-t">
                <td className="px-4 py-3">
                  <button
                    type="button"
                    className="text-primary hover:underline"
                    onClick={() => onOpenDay(row.date)}
                  >
                    {row.date}
                  </button>
                </td>
                <td className="px-4 py-3 tabular-nums">{row.inboundQty}</td>
                <td className="px-4 py-3 tabular-nums">{row.outboundQty}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-border border-t font-medium">
              <td className="px-4 py-3">Month total</td>
              <td className="px-4 py-3 tabular-nums">
                {report.inbound.quantityTotal.toLocaleString()}
              </td>
              <td className="px-4 py-3 tabular-nums">
                {report.outbound.quantityTotal.toLocaleString()}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
