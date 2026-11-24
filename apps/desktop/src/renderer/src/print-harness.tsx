// TEMP print harness — delete after verification.
import "./globals.css";
import { createRoot } from "react-dom/client";
import { PrintDocument } from "@renderer/components/print-document";
import { SaleThermalReceipt } from "@renderer/features/sales/sale-thermal-receipt";
import { SaleReturnThermalReceipt } from "@renderer/features/sales/sale-return-thermal-receipt";
import { printDocument } from "@renderer/lib/print-document";
const items = [
  { id: "1", productName: "Hilal Kurkure Chocolate", variantName: "Large", quantity: 2, unitPrice: 50, lineTotal: 100, gstPercent: 18, discountPercent: 0, focQuantity: 0 },
  { id: "2", productName: "Adams Cheese Slices", variantName: "200g", quantity: 1, unitPrice: 790, lineTotal: 790, gstPercent: 18, discountPercent: 5, focQuantity: 1 },
  { id: "3", productName: "Test Product With A Fairly Long Name That Wraps", variantName: "", quantity: 3, unitPrice: 120, lineTotal: 360, gstPercent: 0, discountPercent: 0, focQuantity: 0 },
];
const sale = { id: "s1", saleNumber: "ST-SR-C0-1234", status: "POSTED", postedAt: new Date().toISOString(), customerName: "CASH SALES CUSTOMER",
  items, subtotal: 1250, gstAmount: 135.59, salesTaxAmount: 0, salesTaxRate: 0, total: 1250, cashTendered: 1500,
  payments: [{ id: "p1", method: "CASH", amount: 1250 }], fbrInvoiceNumber: null, fbrStatus: null, fbrError: null, fbrSellerNtn: "1234567-8" } as any;
const ret = { returnNumber: "ST-CR-C0-1234", returnDate: new Date().toISOString().slice(0, 10), status: "COMPLETED", sale,
  items: [items[1]], subtotal: 790, gstAmount: 0, gstRate: 0, salesTaxAmount: 0, salesTaxRate: 0, refundTotal: 790, refundMethod: "CASH" } as any;
const kind = new URLSearchParams(location.search).get("doc") ?? "sale";
const biz = { businessName: "Staging Test", businessAddress: "Johar Town, Lahore, PK", businessPhone: "123123123" };
createRoot(document.getElementById("root")!).render(
  <div className="min-h-screen"><main className="mx-auto max-w-6xl p-6"><div className="space-y-6">
    <div className="h-[400px] w-[1100px]">screen-only stuff</div>
    <PrintDocument showStoreHeader={false}>
      {kind === "sale" ? <SaleThermalReceipt detail={sale} cashierName="Waleed" {...biz} /> : <SaleReturnThermalReceipt detail={ret} managerName="Awais" {...biz} />}
    </PrintDocument>
  </div></main></div>,
);
(window as any).blackbox = { printPage: (o: unknown) => { (window as any).__printOpts = o; return new Promise(() => {}); } };
(window as any).__runPrintDocument = () => printDocument();
