import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type {
  GoodsReceiptListItem,
  GoodsReceiptStatus,
  VendorListItem,
  WarehouseListItem,
} from "@blackbox/shared";
import { formatStoredDateTime, GOODS_RECEIPT_STATUSES } from "@blackbox/shared";
import { Input } from "@blackbox/ui/input";
import { Skeleton } from "@blackbox/ui/skeleton";
import { ApiError } from "@renderer/lib/api/client";
import { vendorsApi } from "@renderer/lib/api/vendors";
import {
  loadGoodsReceipts,
  loadWarehouses,
} from "@renderer/lib/local-db/entity-source";
import {
  resolveDataSourceMode,
  type DataSourceMode,
} from "@renderer/lib/local-db/data-source";
import { useSyncDataVersion } from "@renderer/lib/sync/sync-status";
import { barcodeScanInputProps, useBarcodeScanTarget } from "@renderer/lib/barcode-scan";
import {
  DEFAULT_LIST_PAGE_SIZE,
  ListPagination,
  useResetPageOnFilterChange,
} from "@renderer/components/list-pagination";

export function GoodsReceiptsListPage() {
  const dataVersion = useSyncDataVersion();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<GoodsReceiptStatus | "">("");
  const [vendorId, setVendorId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [vendors, setVendors] = useState<VendorListItem[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseListItem[]>([]);
  const [items, setItems] = useState<GoodsReceiptListItem[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_LIST_PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dataSource, setDataSource] = useState<DataSourceMode>("api");
  const searchRef = useRef<HTMLInputElement>(null);

  useBarcodeScanTarget({
    kind: "search",
    enabled: true,
    inputRef: searchRef,
    onScan: setSearch,
  });

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
          setWarehouses(await loadWarehouses("all"));
        } else {
          const vendorsRes = await vendorsApi.list({
            status: "active",
            pageSize: 100,
          });
          setVendors(vendorsRes.items);
          setWarehouses(await loadWarehouses("all"));
        }
      } catch {
        /* filters optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dataVersion]);

  useResetPageOnFilterChange(setPage, [
    search,
    status,
    vendorId,
    warehouseId,
    dateFrom,
    dateTo,
    dataVersion,
  ]);

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
          const res = await loadGoodsReceipts({
            search: search.trim() || undefined,
            status: status || undefined,
            vendorId: vendorId || undefined,
            warehouseId: warehouseId || undefined,
            dateFrom: dateFrom || undefined,
            dateTo: dateTo || undefined,
            page,
            pageSize,
          });
          if (!cancelled) {
            setItems(res.items);
            setTotal(res.total);
          }
        } catch (err: unknown) {
          if (cancelled) return;
          setError(
            err instanceof ApiError
              ? err.message
              : "Failed to load purchase vouchers",
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
    page,
    pageSize,
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Purchase Vouchers
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Posted receive vouchers for purchase orders.
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            {dataSource === "local"
              ? "Showing local data"
              : "Showing API data"}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Input
          ref={searchRef}
          {...barcodeScanInputProps()}
          className="max-w-xs"
          placeholder="Search PV / PO / vendor…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="border-input bg-background h-9 rounded-md border px-3 text-sm"
          value={status}
          onChange={(e) =>
            setStatus(e.target.value as GoodsReceiptStatus | "")
          }
        >
          <option value="">All statuses</option>
          {GOODS_RECEIPT_STATUSES.map((s) => (
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
              <th className="px-4 py-3 font-medium">PV Number</th>
              <th className="px-4 py-3 font-medium">PO Number</th>
              <th className="px-4 py-3 font-medium">Vendor</th>
              <th className="px-4 py-3 font-medium">Warehouse</th>
              <th className="px-4 py-3 font-medium">Received</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Total</th>
              <th className="px-4 py-3 font-medium">Items</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr className="border-border border-t">
                <td colSpan={8} className="px-4 py-4">
                  <Skeleton className="h-8 w-full" />
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr className="border-border border-t">
                <td
                  colSpan={8}
                  className="text-muted-foreground px-4 py-8 text-center"
                >
                  No purchase vouchers found.
                </td>
              </tr>
            ) : (
              items.map((gr) => (
                <tr key={gr.id} className="border-border border-t">
                  <td className="px-4 py-3">
                    <Link
                      to={`/goods-receipts/${gr.id}`}
                      className="text-primary font-medium hover:underline"
                    >
                      {gr.receiptNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      to={`/purchase-orders/${gr.purchaseOrderId}`}
                      className="text-primary hover:underline"
                    >
                      {gr.poNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{gr.vendorName ?? "—"}</td>
                  <td className="px-4 py-3">{gr.warehouseName}</td>
                  <td className="px-4 py-3">
                    {formatStoredDateTime(gr.receivedAt)}
                  </td>
                  <td className="px-4 py-3">
                    {gr.status.replaceAll("_", " ")}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {gr.total.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{gr.itemCount}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ListPagination
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
      />
    </div>
  );
}
