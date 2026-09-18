import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type {
  InventoryOutReturnListItem,
  WarehouseListItem,
} from "@blackbox/shared";
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
import { loadInventoryOutReturns, loadWarehouses } from "@renderer/lib/local-db/entity-source";
import { barcodeScanInputProps, useBarcodeScanTarget } from "@renderer/lib/barcode-scan";
import {
  DEFAULT_LIST_PAGE_SIZE,
  ListPagination,
  useResetPageOnFilterChange,
} from "@renderer/components/list-pagination";

export function InventoryOutReturnListPage() {
  const navigate = useNavigate();
  const [warehouses, setWarehouses] = useState<WarehouseListItem[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<InventoryOutReturnListItem[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_LIST_PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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

  useResetPageOnFilterChange(setPage, [warehouseId, search]);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      setLoading(true);
      void loadInventoryOutReturns({
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
            setError(getApiErrorMessage(err, "Failed to load returns"));
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [warehouseId, search, page, pageSize]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Inventory out returns
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Return stock from POS / front store to warehouse
          </p>
        </div>
        <Button onClick={() => navigate("/inventory/out-returns/new")}>
          New return
        </Button>
      </div>

      <ListFilterNav>
        <Input
          ref={searchRef}
          placeholder="Search return number…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          {...barcodeScanInputProps}
        />
        <select
          className={FILTER_SELECT_CLASS}
          value={warehouseId}
          onChange={(e) => setWarehouseId(e.target.value)}
          {...filterSelectProps}
        >
          <option value="">All warehouses</option>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </ListFilterNav>

      {error ? (
        <div
          role="alert"
          className="border-destructive/40 bg-destructive/5 text-destructive rounded-lg border px-4 py-3 text-sm"
        >
          {error}
        </div>
      ) : null}

      <div className="rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left">
              <th className="px-4 py-2 font-medium">Return #</th>
              <th className="px-4 py-2 font-medium">Warehouse</th>
              <th className="px-4 py-2 font-medium">Date</th>
              <th className="px-4 py-2 font-medium text-right">Total</th>
              <th className="px-4 py-2 font-medium text-right">Lines</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <ListTableRow>
                <td colSpan={5} className="text-muted-foreground px-4 py-6">
                  Loading…
                </td>
              </ListTableRow>
            ) : items.length === 0 ? (
              <ListTableRow>
                <td colSpan={5} className="text-muted-foreground px-4 py-6">
                  No returns found
                </td>
              </ListTableRow>
            ) : (
              items.map((row) => (
                <ListTableRow key={row.id}>
                  <td className="px-4 py-2">
                    <ListTableLink to={`/inventory/out-returns/${row.id}`}>
                      {row.returnNumber}
                    </ListTableLink>
                  </td>
                  <td className="px-4 py-2">{row.warehouseName}</td>
                  <td className="px-4 py-2">{row.returnDate}</td>
                  <td className="px-4 py-2 text-right">{row.total.toFixed(2)}</td>
                  <td className="px-4 py-2 text-right">{row.itemCount}</td>
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
