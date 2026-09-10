import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type {
  InventoryOutListItem,
  WarehouseListItem,
} from "@blackbox/shared";
import { Button } from "@blackbox/ui/button";
import { Input } from "@blackbox/ui/input";
import { Skeleton } from "@blackbox/ui/skeleton";
import { ApiError } from "@renderer/lib/api/client";
import {
  loadInventoryOuts,
  loadWarehouses,
} from "@renderer/lib/local-db/entity-source";
import {
  resolveDataSourceMode,
  type DataSourceMode,
} from "@renderer/lib/local-db/data-source";
import { useSyncDataVersion } from "@renderer/lib/sync/sync-status";
import { ListTableLink, ListTableRow } from "@renderer/components/list-table-row";
import {
  KEYBOARD_HINT_LIST_ROWS,
  KeyboardHints,
} from "@renderer/components/keyboard-hints";
import {
  FILTER_SELECT_CLASS,
  filterDateProps,
  filterSelectProps,
  ListFilterNav,
} from "@renderer/components/list-filter-nav";
import { barcodeScanInputProps, useBarcodeScanTarget } from "@renderer/lib/barcode-scan";
import {
  DEFAULT_LIST_PAGE_SIZE,
  ListPagination,
  useResetPageOnFilterChange,
} from "@renderer/components/list-pagination";

export function InventoryOutListPage() {
  const navigate = useNavigate();
  const dataVersion = useSyncDataVersion();
  const [search, setSearch] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [warehouses, setWarehouses] = useState<WarehouseListItem[]>([]);
  const [items, setItems] = useState<InventoryOutListItem[]>([]);
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
    searchRef.current?.focus();
  }, []);

  useEffect(() => {
    void loadWarehouses("active")
      .then(setWarehouses)
      .catch(() => undefined);
  }, []);

  useResetPageOnFilterChange(setPage, [
    warehouseId,
    search,
    dateFrom,
    dateTo,
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
          const res = await loadInventoryOuts({
            search: search.trim() || undefined,
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
              : "Failed to load inventory outs",
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
  }, [search, warehouseId, dateFrom, dateTo, dataVersion, page, pageSize]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Inventory Out
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Post stock out of the warehouse and review past outs.
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            {dataSource === "local"
              ? "Showing local data"
              : "Showing API data"}
          </p>
        </div>
        <Button onClick={() => navigate("/inventory/out/new")}>
          + New inventory out
        </Button>
      </div>

      <ListFilterNav>
        <Input
          ref={searchRef}
          {...barcodeScanInputProps()}
          className="max-w-xs"
          placeholder="Search out # / reference…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className={FILTER_SELECT_CLASS}
          {...filterSelectProps()}
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
          {...filterDateProps()}
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
        />
        <Input
          type="date"
          className="w-auto"
          {...filterDateProps()}
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
        />
      </ListFilterNav>

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
              <th className="px-4 py-3 font-medium">Out #</th>
              <th className="px-4 py-3 font-medium">Warehouse</th>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Reference</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Total</th>
              <th className="px-4 py-3 font-medium">Items</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr className="border-border border-t">
                <td colSpan={7} className="px-4 py-4">
                  <Skeleton className="h-8 w-full" />
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr className="border-border border-t">
                <td
                  colSpan={7}
                  className="text-muted-foreground px-4 py-8 text-center"
                >
                  No inventory outs found.
                </td>
              </tr>
            ) : (
              items.map((row) => (
                <ListTableRow
                  key={row.id}
                  onActivate={() => navigate(`/inventory/out/${row.id}`)}
                >
                  <td className="px-4 py-3">
                    <ListTableLink
                      to={`/inventory/out/${row.id}`}
                      className="text-primary font-medium hover:underline"
                    >
                      {row.outNumber}
                    </ListTableLink>
                  </td>
                  <td className="px-4 py-3">{row.warehouseName}</td>
                  <td className="px-4 py-3">{row.outDate}</td>
                  <td className="px-4 py-3">{row.reference ?? "—"}</td>
                  <td className="px-4 py-3">{row.status}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {row.total.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{row.itemCount}</td>
                </ListTableRow>
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
      <KeyboardHints hints={[KEYBOARD_HINT_LIST_ROWS]} />
    </div>
  );
}
