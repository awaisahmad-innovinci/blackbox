import { useEffect, useRef, useState } from "react";
import type { SaleDetail } from "@blackbox/shared";
import { openDrawerAfterReceiptPrint } from "@renderer/components/print-button";
import { PrintDocument } from "@renderer/components/print-document";
import { loadSale, loadSaleReturnCreditForSale } from "@renderer/lib/local-db/entity-source";
import { printDocument } from "@renderer/lib/print-document";
import { useSession } from "@renderer/lib/session/context";
import { SaleThermalReceipt, type SaleReturnCreditReceipt } from "./sale-thermal-receipt";

/**
 * Prints a just-posted sale's receipt without leaving the sale screen: straight to the receipt
 * printer (dialog if none is configured), then the cash drawer. Same data as SaleDetailPage.
 */
export function PostedSaleAutoPrint({
  saleId,
  onDone,
}: {
  saleId: string;
  onDone: () => void;
}) {
  const { user } = useSession();
  const [detail, setDetail] = useState<SaleDetail | null>(null);
  const [returnCredit, setReturnCredit] = useState<SaleReturnCreditReceipt>();
  const printed = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([loadSale(saleId), loadSaleReturnCreditForSale(saleId)])
      .then(([row, credit]) => {
        if (cancelled) return;
        if (credit && row.status === "POSTED") {
          setReturnCredit({
            returnNumber: credit.returnNumber,
            amount: credit.amount,
            cashBack: Math.max(0, credit.amount - row.total),
          });
        }
        setDetail(row);
      })
      .catch(() => {
        if (!cancelled) onDone(); // sale still posted; reprint from the sales list
      });
    return () => {
      cancelled = true;
    };
  }, [saleId, onDone]);

  useEffect(() => {
    if (!detail || printed.current) return;
    printed.current = true;
    void printDocument({ silent: true })
      .then((ok) => {
        if (ok) void openDrawerAfterReceiptPrint();
      })
      .finally(() => {
        if (mounted.current) onDone(); // don't pull the cashier back if they left the sale screen
      });
  }, [detail, onDone]);

  if (!detail) return null;

  // Off-screen, not display:none: printDocument() measures the slip height. Print CSS resets position/width.
  return (
    <div aria-hidden className="fixed top-0 left-[-10000px] w-[72mm]">
      <PrintDocument showStoreHeader={false}>
        <SaleThermalReceipt
          detail={detail}
          businessName={user?.tenantName?.trim() ?? ""}
          businessAddress={user?.businessAddress}
          businessPhone={user?.businessPhone}
          cashierName={detail.postedByName?.trim() || user?.fullName?.trim() || "—"}
          returnCredit={returnCredit}
          fbrEnabled={user?.fbrEnabled === true}
        />
      </PrintDocument>
    </div>
  );
}
