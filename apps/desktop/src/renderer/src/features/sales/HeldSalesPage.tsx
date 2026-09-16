import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { SaleListItem } from "@blackbox/shared";
import { Button } from "@blackbox/ui/button";
import { getApiErrorMessage } from "@renderer/lib/api/client";
import { ListTableLink, ListTableRow } from "@renderer/components/list-table-row";
import { useConfirm } from "@renderer/components/confirm-provider";
import { loadSales } from "@renderer/lib/local-db/entity-source";
import { useSalesAccess } from "@renderer/lib/use-sales-access";

export function HeldSalesPage() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { canWrite } = useSalesAccess();
  const [items, setItems] = useState<SaleListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [discardingId, setDiscardingId] = useState<string | null>(null);

  useEffect(() => {
    if (!canWrite) navigate("/sales/new", { replace: true });
  }, [canWrite, navigate]);

  async function refreshHeldBills() {
    setLoading(true);
    try {
      const res = await loadSales({ status: "DRAFT", pageSize: 100 });
      setItems(res.items);
      setError(null);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Failed to load held bills"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshHeldBills();
  }, []);

  async function onDiscard(id: string, saleNumber: string) {
    const ok = await confirm({
      title: "Discard held bill?",
      description: `${saleNumber} will be removed from this device. Reserved stock is released.`,
      confirmLabel: "Discard",
    });
    if (!ok) return;

    setDiscardingId(id);
    setError(null);
    try {
      const result = await window.blackbox?.localDb?.deleteSaleDraft?.(id);
      if (!result?.ok) {
        setError("Held bill not found or already removed");
        return;
      }
      setItems((prev) => prev.filter((row) => row.id !== id));
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Failed to discard held bill"));
    } finally {
      setDiscardingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Held bills</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Paused sales on this device — stock is reserved until you post or
            discard
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate("/sales/new")}>
            New sale
          </Button>
          <Button variant="outline" onClick={() => navigate("/sales")}>
            Past sales
          </Button>
        </div>
      </div>

      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-muted-foreground text-sm">Loading held bills…</p>
      ) : items.length === 0 ? (
        <p className="text-muted-foreground text-sm">No held bills on this device.</p>
      ) : (
        <div className="border-border overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Hold #</th>
                <th className="px-4 py-3 font-medium">Warehouse</th>
                <th className="px-4 py-3 font-medium">Items</th>
                <th className="px-4 py-3 font-medium">Total</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <ListTableRow key={row.id}>
                  <td className="px-4 py-3">
                    <ListTableLink to={`/sales/${row.id}`}>
                      {row.saleNumber}
                    </ListTableLink>
                  </td>
                  <td className="px-4 py-3">{row.warehouseName}</td>
                  <td className="px-4 py-3 tabular-nums">{row.itemCount}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {row.total.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => navigate(`/sales/new/${row.id}`)}
                      >
                        Resume
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={discardingId === row.id}
                        onClick={() => void onDiscard(row.id, row.saleNumber)}
                      >
                        {discardingId === row.id ? "Discarding…" : "Discard"}
                      </Button>
                    </div>
                  </td>
                </ListTableRow>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
