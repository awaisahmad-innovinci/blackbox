import type {
  TaxReportCollectedFromCustomers,
  TaxReportKind,
  TaxReportPaidToVendors,
} from "./tax-report";

export function applyTaxReportPaidTaxKind(
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

export function applyTaxReportCollectedTaxKind(
  collected: TaxReportCollectedFromCustomers,
  taxKind: TaxReportKind,
): TaxReportCollectedFromCustomers {
  if (taxKind === "all" || taxKind === "gst") return collected;
  if (taxKind === "sales_tax") {
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