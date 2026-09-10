import type {
  InventoryInOutDirection,
  InventoryInOutReport,
  InventoryMovementListItem,
} from "./inventory";

export function escapeCsvField(value: string | number): string {
  const text = String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function csvRow(values: (string | number)[]): string {
  return values.map(escapeCsvField).join(",");
}

function formatMovementTime(createdAt: string): string {
  return createdAt.replace("T", " ").slice(0, 19);
}

function movementRow(
  direction: "In" | "Out",
  item: InventoryMovementListItem,
): string {
  return csvRow([
    direction,
    formatMovementTime(item.createdAt),
    item.productName ?? "",
    item.sku,
    item.variantName ?? "",
    item.vendorName ?? "",
    item.warehouseName,
    item.quantity,
    item.reason ?? "",
  ]);
}

export function inventoryInOutReportCsvFilename(
  dateFrom: string,
  dateTo: string,
): string {
  return `inventory-in-out_${dateFrom}_${dateTo}.csv`;
}

export function buildInventoryInOutReportCsv(
  report: InventoryInOutReport,
  direction: InventoryInOutDirection,
): string {
  const showIn = direction === "both" || direction === "in";
  const showOut = direction === "both" || direction === "out";
  const rangeLabel =
    report.dateFrom === report.dateTo
      ? report.dateFrom
      : `${report.dateFrom} – ${report.dateTo}`;

  const lines: string[] = [csvRow(["Period", rangeLabel])];

  if (showIn) {
    lines.push(
      csvRow([
        "In total",
        report.inbound.quantityTotal,
        `${report.inbound.lineCount} lines`,
      ]),
    );
  }
  if (showOut) {
    lines.push(
      csvRow([
        "Out total",
        report.outbound.quantityTotal,
        `${report.outbound.lineCount} lines`,
      ]),
    );
  }

  lines.push("");
  lines.push(
    csvRow([
      "Direction",
      "Time",
      "Product",
      "SKU",
      "Variant",
      "Vendor",
      "Warehouse",
      "Qty",
      "Reason",
    ]),
  );

  if (showIn) {
    for (const item of report.inbound.items) {
      lines.push(movementRow("In", item));
    }
  }
  if (showOut) {
    for (const item of report.outbound.items) {
      lines.push(movementRow("Out", item));
    }
  }

  return `${lines.join("\r\n")}\r\n`;
}
