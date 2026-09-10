import type { InventoryInOutReport } from "./inventory";

export type InventoryInOutPeriodMode = "date" | "month" | "year";

export interface InventoryInOutPeriodInput {
  mode: InventoryInOutPeriodMode;
  dateFrom: string;
  dateTo: string;
  monthFrom: string;
  monthTo: string;
  yearFrom: string;
  yearTo: string;
}

export interface InventoryInOutPeriodSummaryRow {
  label: string;
  inboundQty: number;
  outboundQty: number;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export const DEFAULT_INVENTORY_IN_OUT_PERIOD: InventoryInOutPeriodInput = {
  mode: "date",
  dateFrom: todayIso(),
  dateTo: todayIso(),
  monthFrom: todayIso().slice(0, 7),
  monthTo: todayIso().slice(0, 7),
  yearFrom: todayIso().slice(0, 4),
  yearTo: todayIso().slice(0, 4),
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_MONTH = /^\d{4}-\d{2}$/;
const ISO_YEAR = /^\d{4}$/;

export function lastDayOfMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return `${y}-${mm}-${String(last).padStart(2, "0")}`;
}

export function isSingleDayRange(dateFrom: string, dateTo: string): boolean {
  return dateFrom === dateTo;
}

function eachMonthInclusive(monthFrom: string, monthTo: string): string[] {
  const months: string[] = [];
  let y = Number(monthFrom.slice(0, 4));
  let m = Number(monthFrom.slice(5, 7));
  const endY = Number(monthTo.slice(0, 4));
  const endM = Number(monthTo.slice(5, 7));
  while (y < endY || (y === endY && m <= endM)) {
    months.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return months;
}

function eachYearInclusive(yearFrom: string, yearTo: string): string[] {
  const start = Number(yearFrom);
  const end = Number(yearTo);
  const years: string[] = [];
  for (let y = start; y <= end; y += 1) {
    years.push(String(y));
  }
  return years;
}

export function resolveInventoryInOutReportRange(
  period: InventoryInOutPeriodInput,
):
  | { dateFrom: string; dateTo: string }
  | { error: string } {
  if (period.mode === "date") {
    if (!ISO_DATE.test(period.dateFrom) || !ISO_DATE.test(period.dateTo)) {
      return { error: "Enter valid from and to dates" };
    }
    if (period.dateFrom > period.dateTo) {
      return { error: "From date must be on or before to date" };
    }
    return { dateFrom: period.dateFrom, dateTo: period.dateTo };
  }

  if (period.mode === "month") {
    if (!ISO_MONTH.test(period.monthFrom) || !ISO_MONTH.test(period.monthTo)) {
      return { error: "Enter valid from and to months" };
    }
    if (period.monthFrom > period.monthTo) {
      return { error: "From month must be on or before to month" };
    }
    return {
      dateFrom: `${period.monthFrom}-01`,
      dateTo: lastDayOfMonth(period.monthTo),
    };
  }

  if (!ISO_YEAR.test(period.yearFrom) || !ISO_YEAR.test(period.yearTo)) {
    return { error: "Enter valid from and to years" };
  }
  if (period.yearFrom > period.yearTo) {
    return { error: "From year must be on or before to year" };
  }
  return {
    dateFrom: `${period.yearFrom}-01-01`,
    dateTo: `${period.yearTo}-12-31`,
  };
}

export function aggregateInOutByMonth(
  report: InventoryInOutReport,
): InventoryInOutPeriodSummaryRow[] {
  const qtyByMonth = new Map<string, { inboundQty: number; outboundQty: number }>();
  for (const row of report.byDay) {
    const month = row.date.slice(0, 7);
    const bucket = qtyByMonth.get(month) ?? { inboundQty: 0, outboundQty: 0 };
    bucket.inboundQty += row.inboundQty;
    bucket.outboundQty += row.outboundQty;
    qtyByMonth.set(month, bucket);
  }

  const monthFrom = report.dateFrom.slice(0, 7);
  const monthTo = report.dateTo.slice(0, 7);
  return eachMonthInclusive(monthFrom, monthTo).map((month) => {
    const bucket = qtyByMonth.get(month);
    return {
      label: month,
      inboundQty: bucket?.inboundQty ?? 0,
      outboundQty: bucket?.outboundQty ?? 0,
    };
  });
}

export function aggregateInOutByYear(
  report: InventoryInOutReport,
): InventoryInOutPeriodSummaryRow[] {
  const qtyByYear = new Map<string, { inboundQty: number; outboundQty: number }>();
  for (const row of report.byDay) {
    const year = row.date.slice(0, 4);
    const bucket = qtyByYear.get(year) ?? { inboundQty: 0, outboundQty: 0 };
    bucket.inboundQty += row.inboundQty;
    bucket.outboundQty += row.outboundQty;
    qtyByYear.set(year, bucket);
  }

  const yearFrom = report.dateFrom.slice(0, 4);
  const yearTo = report.dateTo.slice(0, 4);
  return eachYearInclusive(yearFrom, yearTo).map((year) => {
    const bucket = qtyByYear.get(year);
    return {
      label: year,
      inboundQty: bucket?.inboundQty ?? 0,
      outboundQty: bucket?.outboundQty ?? 0,
    };
  });
}

export function dailySummaryRows(
  report: InventoryInOutReport,
): InventoryInOutPeriodSummaryRow[] {
  return report.byDay.map((row) => ({
    label: row.date,
    inboundQty: row.inboundQty,
    outboundQty: row.outboundQty,
  }));
}
