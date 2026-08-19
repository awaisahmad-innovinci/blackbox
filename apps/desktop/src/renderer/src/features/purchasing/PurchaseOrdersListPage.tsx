import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type {
  PurchaseOrderListItem,
  PurchaseOrderStatus,
  VendorListItem,
  WarehouseListItem,
} from "@blackbox/shared";
import { PURCHASE_ORDER_STATUSES } from "@blackbox/shared";
import { Button } from "@blackbox/ui/button";
import { Input } from "@blackbox/ui/input";
import { Skeleton } from "@blackbox/ui/skeleton";
import { ApiError } from "@renderer/lib/api/client";
import { purchaseOrdersApi } from "@renderer/lib/api/purchase-orders";
import { vendorsApi } from "@renderer/lib/api/vendors";
import { warehousesApi } from "@renderer/lib/api/warehouses";
import {
  resolveDataSourceMode,
  type DataSourceMode,
} from "@renderer/lib/local-db/data-source";
import { useSyncDataVersion } from "@renderer/lib/sync/sync-status";

export function PurchaseOrdersListPage() {
  const navigate = useNavigate();
  const dataVersion = useSyncDataVersion();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<PurchaseOrderStatus | "">("");
  const [vendorId, setVendorId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [vendors, setVendors] = useState<VendorListItem[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseListItem[]>([]);
  const [items, setItems] = useState<PurchaseOrderListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dataSource, setDataSource] = useState<DataSourceMode>("api");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const mode = await resolveDataSourceMode();
      if (cancelled) return;
      setDataSource(mode);
      try {
        if (mode === "local" && window.blackbox?.localDb?.listVendors) {
          const vendorsRes = await window.blackbox.localDb.listVendors({
            status: "active",
            pageSize: 100,
          });
          setVendors(vendorsRes.items);
          setWarehouses(await window.blackbox.localDb.listWarehouses!());
        } else {
          const vendorsRes = await vendorsApi.list({
            status: "active",
            pageSize: 100,
          });
          setVendors(vendorsRes.items);
          setWarehouses(await warehousesApi.list());
        }
      } catch {
        /* filters optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dataVersion]);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      setLoading(true);
      setError(null);
      void (async () => {
        try {
          const mode = await resolveDataSourceMode();
          if (cancelled) return;
          setDataSource(mode);
          const query = {
            search: search.trim() || undefined,
            status: status || undefined,
            vendorId: vendorId || undefined,
            warehouseId: warehouseId || undefined,
            dateFrom: dateFrom || undefined,
            dateTo: dateTo || undefined,
          };
          const res =
            mode === "local" && window.blackbox?.localDb?.listPurchaseOrders
              ? await window.blackbox.localDb.listPurchaseOrders(query)
              : await purchaseOrdersApi.list(query);
          if (!cancelled) setItems(res.items);
        } catch (err: unknown) {
          if (cancelled) return;
          setError(
            err instanceof ApiError
              ? err.message
              : "Failed to load purchase orders",
          );
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [
    search,
    status,
    vendorId,
    warehouseId,
    dateFrom,
    dateTo,
    dataVersion,
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Purchase Orders
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Draft, submit, and track orders to suppliers.
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            {dataSource === "local"
              ? "Showing local data"
              : "Showing API data"}
          </p>
        </div>
        <Button onClick={() => navigate("/purchase-orders/new")}>
          + Create Purchase Order
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <Input
          className="max-w-xs"
          placeholder="Search PO / vendor…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="border-input bg-background h-9 rounded-md border px-3 text-sm"
          value={status}
          onChange={(e) =>
            setStatus(e.target.value as PurchaseOrderStatus | "")
          }
        >
          <option value="">All statuses</option>
          {PURCHASE_ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replaceAll("_", " ")}
            </option>
          ))}
        </select>
        <select
          className="border-input bg-background h-9 rounded-md border px-3 text-sm"
          value={vendorId}
          onChange={(e) => setVendorId(e.target.value)}
        >
          <option value="">All vendors</option>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
        <select
          className="border-input bg-background h-9 rounded-md border px-3 text-sm"
          value={warehouseId}
          onChange={(e) => setWarehouseId(e.target.value)}
        >
          <option value="">All warehouses</option>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <Input
          type="date"
          className="w-auto"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
        />
        <Input
          type="date"
          className="w-auto"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
        />
      </div>

      {error ? (
        <div
          role="alert"
          className="border-destructive/40 bg-destructive/5 text-destructive rounded-lg border px-4 py-3 text-sm"
        >
          {error}
        </div>
      ) : null}

      <div className="border-border overflow-hidden rounded-lg border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">PO Number</th>
              <th className="px-4 py-3 font-medium">Vendor</th>
              <th className="px-4 py-3 font-medium">Warehouse</th>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr className="border-border border-t">
                <td colSpan={6} className="px-4 py-4">
                  <Skeleton className="h-8 w-full" />
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr className="border-border border-t">
                <td
                  colSpan={6}
                  className="text-muted-foreground px-4 py-8 text-center"
                >
                  No purchase orders found.
                </td>
              </tr>
            ) : (
              items.map((po) => (
                <tr key={po.id} className="border-border border-t">
                  <td className="px-4 py-3">
                    <Link
                      to={`/purchase-orders/${po.id}`}
                      className="text-primary font-medium hover:underline"
                    >
                      {po.poNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{po.vendorName}</td>
                  <td className="px-4 py-3">{po.warehouseName}</td>
                  <td className="px-4 py-3">{po.orderDate}</td>
                  <td className="px-4 py-3">
                    {po.status.replaceAll("_", " ")}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {po.total.toLocaleString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
