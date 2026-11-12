import type { TaxReportSummary } from "./tax-report";
import { escapeCsvField } from "./inventory-in-out-report-csv";

function csvRow(values: (string | number)[]): string {
  return values.map(escapeCsvField).join(",");
}

export function taxReportCsvFilename(dateFrom: string, dateTo: string): string {
  return `tax-report_${dateFrom}_${dateTo}.csv`;
}

export function buildTaxReportCsv(report: TaxReportSummary): string {
  const lines: string[] = [];
  lines.push(
    csvRow([
      "Section",
      "Sale tax (vendor)",
      "Adv tax",
      "GST",
      "Credits",
      "Total",
    ]),
  );
  const p = report.paidToVendors;
  lines.push(
    csvRow([
      "Paid to vendors (total)",
      p.saleTax,
      p.advTax,
      p.gst,
      p.credits,
      p.totalTaxPaid,
    ]),
  );
  for (const row of p.byVendor) {
    lines.push(
      csvRow([
        `Vendor: ${row.vendorName}`,
        row.saleTax,
        row.advTax,
        row.gst,
        row.credits,
        row.totalTaxPaid,
      ]),
    );
  }
  for (const row of p.byMonth) {
    lines.push(
      csvRow([
        `Month: ${row.month}`,
        row.saleTax,
        row.advTax,
        row.gst,
        row.credits,
        row.totalTaxPaid,
      ]),
    );
  }
  lines.push("");
  lines.push(csvRow(["Collected (customers)", "GST", "Sales tax", "Total"]));
  const c = report.collectedFromCustomers;
  lines.push(
    csvRow([
      "Gross",
      c.gross.gst,
      c.gross.salesTax,
      c.gross.total,
    ]),
  );
  lines.push(
    csvRow([
      "Returns",
      c.returns.gst,
      c.returns.salesTax,
      c.returns.total,
    ]),
  );
  lines.push(
    csvRow(["Net", c.net.gst, c.net.salesTax, c.net.total]),
  );
  return `${lines.join("\n")}\n`;
}
