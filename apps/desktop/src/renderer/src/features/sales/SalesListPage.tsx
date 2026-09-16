import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { SaleListItem, WarehouseListItem } from "@blackbox/shared";
import { Button } from "@blackbox/ui/button";
import { Input } from "@blackbox/ui/input";
import { getApiErrorMessage } from "@renderer/lib/api/client";
import { ListTableLink, ListTableRow } from "@renderer/components/list-table-row";
import {
  KEYBOARD_HINT_LIST_ROWS,
  KeyboardHints,
} from "@renderer/components/keyboard-hints";
import {
  FILTER_SELECT_CLASS,
  filterSelectProps,
  ListFilterNav,
} from "@renderer/components/list-filter-nav";
import { loadSales, loadWarehouses } from "@renderer/lib/local-db/entity-source";
import { barcodeScanInputProps, useBarcodeScanTarget } from "@renderer/lib/barcode-scan";
import {
  DEFAULT_LIST_PAGE_SIZE,
  ListPagination,
  useResetPageOnFilterChange,
} from "@renderer/components/list-pagination";
import { useSalesAccess } from "@renderer/lib/use-sales-access";

export function SalesListPage() {
  const navigate = useNavigate();
  const { canReadList, canWrite } = useSalesAccess();
  const [warehouses, setWarehouses] = useState<WarehouseListItem[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<SaleListItem[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_LIST_PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!canReadList) navigate("/sales/new", { replace: true });
  }, [canReadList, navigate]);

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

  useResetPageOnFilterChange(setPage, [warehouseId, search]);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      void loadSales({
        warehouseId: warehouseId || undefined,
        search: search.trim() || undefined,
        page,
        pageSize,
      })
        .then((res) => {
          if (!cancelled) {
            setItems(res.items);
            setTotal(res.total);
            setError(null);
          }
        })
        .catch((err: unknown) => {
          if (!cancelled) {
            setError(getApiErrorMessage(err, "Failed to load sales"));
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [warehouseId, search, page, pageSize]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Sales</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Posted POS bills and receipts
          </p>
        </div>
        {canWrite ? (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/sales/held")}>
              Held bills
            </Button>
            <Button onClick={() => navigate("/sales/new")}>New sale</Button>
          </div>
        ) : null}
      </div>

      <ListFilterNav>
        <Input
          ref={searchRef}
          placeholder="Search sale number…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          {...barcodeScanInputProps}
        />
        <select
          className={FILTER_SELECT_CLASS}
          value={warehouseId}
          onChange={(event) => setWarehouseId(event.target.value)}
          {...filterSelectProps}
        >
          <option value="">All warehouses</option>
          {warehouses.map((warehouse) => (
            <option key={warehouse.id} value={warehouse.id}>
              {warehouse.name}
            </option>
          ))}
        </select>
      </ListFilterNav>

      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}

      <div className="border-border overflow-hidden rounded-lg border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Sale #</th>
              <th className="px-4 py-3 font-medium">Warehouse</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Items</th>
              <th className="px-4 py-3 font-medium">Total</th>
              <th className="px-4 py-3 font-medium">Posted</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="text-muted-foreground px-4 py-8 text-center">
                  Loading…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-muted-foreground px-4 py-8 text-center">
                  No sales found
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <ListTableRow key={item.id}>
                  <td className="px-4 py-3">
                    <ListTableLink to={`/sales/${item.id}`}>
                      {item.saleNumber}
                    </ListTableLink>
                  </td>
                  <td className="px-4 py-3">{item.warehouseName}</td>
                  <td className="px-4 py-3">{item.status}</td>
                  <td className="px-4 py-3 tabular-nums">{item.itemCount}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {item.total.toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    {item.postedAt
                      ? new Date(item.postedAt).toLocaleString()
                      : "—"}
                  </td>
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
        onPageSizeChange={setPageSize}
      />

      <KeyboardHints hints={[KEYBOARD_HINT_LIST_ROWS]} />
    </div>
  );
}
