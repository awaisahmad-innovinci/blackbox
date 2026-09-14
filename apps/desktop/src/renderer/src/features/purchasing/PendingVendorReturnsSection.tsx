import { useEffect, useMemo, useState } from "react";
import type { PendingVendorReturnLine } from "@blackbox/shared";
import { VENDOR_RETURN_REASON_LABELS } from "@blackbox/shared";
import { loadPendingVendorReturns } from "@renderer/lib/local-db/entity-source";

export function PendingVendorReturnsSection({
  vendorId,
  vendorName,
}: {
  vendorId: string;
  vendorName?: string;
}) {
  const [rows, setRows] = useState<PendingVendorReturnLine[]>([]);

  useEffect(() => {
    if (!vendorId) {
      setRows([]);
      return;
    }
    let cancelled = false;
    void loadPendingVendorReturns(vendorId)
      .then((loaded) => {
        if (!cancelled) setRows(loaded);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [vendorId]);

  const total = useMemo(
    () =>
      Math.round(rows.reduce((sum, line) => sum + line.lineTotal, 0) * 10000) /
      10000,
    [rows],
  );

  if (rows.length === 0) return null;

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-medium">Pending returns</h2>
        <p className="text-muted-foreground text-sm">
          Open returns held with {vendorName ?? "this vendor"}. Shown for
          reference when placing this order.
        </p>
      </div>
      <div className="border-border overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Return</th>
              <th className="px-3 py-2 font-medium">Product</th>
              <th className="px-3 py-2 font-medium">Reason</th>
              <th className="px-3 py-2 font-medium">Qty</th>
              <th className="px-3 py-2 font-medium">Purchase cost</th>
              <th className="px-3 py-2 font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((line) => (
              <tr key={line.vendorReturnItemId} className="border-border border-t">
                <td className="px-3 py-2">{line.returnNumber}</td>
                <td className="px-3 py-2">
                  {line.productName}
                  <div className="text-muted-foreground text-xs">
                    {line.sku}
                    {line.variantName ? ` · ${line.variantName}` : ""}
                  </div>
                </td>
                <td className="px-3 py-2">
                  {VENDOR_RETURN_REASON_LABELS[line.reason]}
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {line.quantity.toLocaleString()} pcs
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {line.unitCost.toLocaleString()}
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {line.lineTotal.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-border border-t">
            <tr>
              <td
                colSpan={5}
                className="px-3 py-2 text-right font-medium"
              >
                Pending returns total
              </td>
              <td className="px-3 py-2 tabular-nums font-medium">
                {total.toLocaleString()}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
