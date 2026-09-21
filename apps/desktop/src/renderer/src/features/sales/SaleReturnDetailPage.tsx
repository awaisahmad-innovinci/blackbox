import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { SaleReturnDetail } from "@blackbox/shared";
import { Button } from "@blackbox/ui/button";
import { PrintButton } from "@renderer/components/print-button";
import { PrintDocument } from "@renderer/components/print-document";
import { ListTableRow } from "@renderer/components/list-table-row";
import { getApiErrorMessage } from "@renderer/lib/api/client";
import { loadSaleReturn } from "@renderer/lib/local-db/entity-source";
import { useSalesAccess } from "@renderer/lib/use-sales-access";
import { defaultRouteForUser } from "@renderer/lib/sales-access";
import { useSession } from "@renderer/lib/session/context";
import { SaleReturnThermalReceipt } from "./sale-return-thermal-receipt";

export function SaleReturnDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { user } = useSession();
  const permissions = user?.permissions ?? [];
  const { canReturn } = useSalesAccess();
  const [detail, setDetail] = useState<SaleReturnDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canReturn) navigate(defaultRouteForUser(permissions), { replace: true });
  }, [canReturn, navigate, permissions]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    void loadSaleReturn(id)
      .then((row) => {
        if (!cancelled) {
          setDetail(row);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(getApiErrorMessage(err, "Return not found"));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return <p className="text-muted-foreground text-sm">Loading return…</p>;
  }

  if (!detail) {
    return (
      <div className="space-y-4">
        <p className="text-destructive text-sm">{error ?? "Return not found"}</p>
        <Button variant="outline" onClick={() => navigate("/sales/returns")}>
          Back to returns
        </Button>
      </div>
    );
  }

  const managerName =
    detail.processedByName?.trim() ||
    user?.fullName?.trim() ||
    user?.username ||
    "Manager";

  return (
    <div className="space-y-6">
      <div className="print:hidden space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {detail.returnNumber}
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Sale {detail.saleNumber} · {detail.warehouseName}
            </p>
          </div>
          <div className="flex gap-2">
            <PrintButton />
            <Button variant="outline" onClick={() => navigate("/sales/returns")}>
              Back to list
            </Button>
          </div>
        </div>

        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Return date</dt>
            <dd>{detail.returnDate}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Refund</dt>
            <dd className="font-semibold tabular-nums">
              {detail.refundTotal.toFixed(2)} ({detail.refundMethod})
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Processed by</dt>
            <dd>{managerName}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Original sale</dt>
            <dd>
              <button
                type="button"
                className="text-primary hover:underline"
                onClick={() => navigate(`/sales/${detail.saleId}`)}
              >
                {detail.saleNumber}
              </button>
            </dd>
          </div>
        </dl>

        <div className="rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left">
              <th className="px-4 py-2">SKU</th>
              <th className="px-4 py-2 text-right">Qty</th>
              <th className="px-4 py-2 text-right">Unit price</th>
              <th className="px-4 py-2 text-right">Line refund</th>
            </tr>
          </thead>
          <tbody>
            {detail.items.map((line) => (
              <ListTableRow key={line.id}>
                <td className="px-4 py-2">
                  <div className="font-medium">{line.sku}</div>
                  <div className="text-muted-foreground text-xs">
                    {line.productName} {line.variantName}
                  </div>
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {line.quantity}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {line.unitPrice.toFixed(2)}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {line.lineTotal.toFixed(2)}
                </td>
              </ListTableRow>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      <PrintDocument showStoreHeader={false}>
        <SaleReturnThermalReceipt
          detail={detail}
          businessName={user?.tenantName ?? ""}
          businessAddress={user?.businessAddress}
          managerName={managerName}
        />
      </PrintDocument>
    </div>
  );
}
