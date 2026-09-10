import type {
  InventoryInOutReport,
  InventoryInOutReportClientFilters,
  InventoryMovementListItem,
} from "./inventory";

export const DEFAULT_INVENTORY_IN_OUT_REPORT_FILTERS: InventoryInOutReportClientFilters =
  {
    direction: "both",
    productSkuIds: [],
    productIds: [],
    vendorIds: [],
    warehouseId: "",
    qtyMin: "",
    qtyMax: "",
  };

export function matchesInventoryInOutMovement(
  item: InventoryMovementListItem,
  filters: InventoryInOutReportClientFilters,
): boolean {
  if (filters.warehouseId && item.warehouseId !== filters.warehouseId) {
    return false;
  }
  if (
    filters.vendorIds.length > 0 &&
    (!item.vendorId || !filters.vendorIds.includes(item.vendorId))
  ) {
    return false;
  }
  if (
    filters.productIds.length > 0 &&
    (!item.productId || !filters.productIds.includes(item.productId))
  ) {
    return false;
  }
  if (
    filters.productSkuIds.length > 0 &&
    !filters.productSkuIds.includes(item.productSkuId)
  ) {
    return false;
  }
  if (filters.qtyMin.trim()) {
    const min = Number(filters.qtyMin);
    if (!Number.isNaN(min) && item.quantity < min) return false;
  }
  if (filters.qtyMax.trim()) {
    const max = Number(filters.qtyMax);
    if (!Number.isNaN(max) && item.quantity > max) return false;
  }
  return true;
}

function bucketFromItems(items: InventoryMovementListItem[]) {
  return {
    items,
    quantityTotal: items.reduce((sum, i) => sum + i.quantity, 0),
    lineCount: items.length,
  };
}

function buildByDay(
  dateFrom: string,
  dateTo: string,
  inboundItems: InventoryMovementListItem[],
  outboundItems: InventoryMovementListItem[],
) {
  const qtyByDay = new Map<string, { inboundQty: number; outboundQty: number }>();

  for (const item of inboundItems) {
    const day = item.createdAt.slice(0, 10);
    const bucket = qtyByDay.get(day) ?? { inboundQty: 0, outboundQty: 0 };
    bucket.inboundQty += item.quantity;
    qtyByDay.set(day, bucket);
  }
  for (const item of outboundItems) {
    const day = item.createdAt.slice(0, 10);
    const bucket = qtyByDay.get(day) ?? { inboundQty: 0, outboundQty: 0 };
    bucket.outboundQty += item.quantity;
    qtyByDay.set(day, bucket);
  }

  const days: string[] = [];
  const cur = new Date(`${dateFrom}T00:00:00.000Z`);
  const last = new Date(`${dateTo}T00:00:00.000Z`);
  if (!Number.isNaN(cur.getTime()) && !Number.isNaN(last.getTime()) && cur <= last) {
    while (cur <= last) {
      days.push(cur.toISOString().slice(0, 10));
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
  }

  return days.map((date) => {
    const bucket = qtyByDay.get(date);
    return {
      date,
      inboundQty: bucket?.inboundQty ?? 0,
      outboundQty: bucket?.outboundQty ?? 0,
    };
  });
}

export function applyInventoryInOutReportFilters(
  report: InventoryInOutReport,
  filters: InventoryInOutReportClientFilters,
): InventoryInOutReport {
  let inboundItems = report.inbound.items.filter((item) =>
    matchesInventoryInOutMovement(item, filters),
  );
  let outboundItems = report.outbound.items.filter((item) =>
    matchesInventoryInOutMovement(item, filters),
  );

  if (filters.direction === "in") {
    outboundItems = [];
  } else if (filters.direction === "out") {
    inboundItems = [];
  }

  return {
    dateFrom: report.dateFrom,
    dateTo: report.dateTo,
    inbound: bucketFromItems(inboundItems),
    outbound: bucketFromItems(outboundItems),
    byDay: buildByDay(
      report.dateFrom,
      report.dateTo,
      inboundItems,
      outboundItems,
    ),
  };
}
