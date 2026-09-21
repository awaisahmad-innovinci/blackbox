import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { SaleReturnListItem, WarehouseListItem } from "@blackbox/shared";
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
  filterDateProps,
  filterSelectProps,
  ListFilterNav,
} from "@renderer/components/list-filter-nav";
import { loadSaleReturns, loadWarehouses, resolveSaleReturnByNumber } from "@renderer/lib/local-db/entity-source";
import { barcodeScanInputProps, useBarcodeScanTarget } from "@renderer/lib/barcode-scan";
import {
  DEFAULT_LIST_PAGE_SIZE,
  ListPagination,
  useResetPageOnFilterChange,
} from "@renderer/components/list-pagination";
import { useSalesAccess } from "@renderer/lib/use-sales-access";
import { defaultRouteForUser } from "@renderer/lib/sales-access";
import { useSession } from "@renderer/lib/session/context";

export function SaleReturnsListPage() {
  const navigate = useNavigate();
  const { user } = useSession();
  const permissions = user?.permissions ?? [];
  const { canReturn } = useSalesAccess();
  const [warehouses, setWarehouses] = useState<WarehouseListItem[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [hasFoc, setHasFoc] = useState<"" | "yes" | "no">("");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<SaleReturnListItem[]>([]);
  const [refundTotalSum, setRefundTotalSum] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_LIST_PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!canReturn) navigate(defaultRouteForUser(permissions), { replace: true });
  }, [canReturn, navigate, permissions]);

  useBarcodeScanTarget({
    kind: "search",
    enabled: true,
    inputRef: searchRef,
    onScan: setSearch,
    onComplete: (code) => {
      void (async () => {
        const match = await resolveSaleReturnByNumber(code);
        if (match) {
          navigate(`/sales/returns/${match.id}`);
          return;
        }
        setError(`Return not found: ${code.trim()}`);
      })();
    },
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
    hasFoc,
  ]);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      void loadSaleReturns({
        warehouseId: warehouseId || undefined,
        search: search.trim() || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        hasFoc: hasFoc === "" ? undefined : hasFoc === "yes",
        page,
        pageSize,
      })
        .then((res) => {
          if (!cancelled) {
            setItems(res.items);
            setTotal(res.total);
            setRefundTotalSum(res.refundTotalSum);
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
      clearTimeout(timer);
    };
  }, [warehouseId, search, dateFrom, dateTo, hasFoc, page, pageSize]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Customer returns
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Posted sale returns and refund totals for the selected period.
          </p>
        </div>
        <Button onClick={() => navigate("/sales/returns/new")}>
          New return
        </Button>
      </div>

      {error ? (
        <div
          role="alert"
          className="border-destructive/40 bg-destructive/5 text-destructive rounded-lg border px-4 py-3 text-sm"
        >
          {error}
        </div>
      ) : null}

      <ListFilterNav>
        <Input
          ref={searchRef}
          {...barcodeScanInputProps()}
          className="max-w-xs"
          placeholder="Return # or sale #"
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
          className="max-w-[10rem]"
          {...filterDateProps()}
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          aria-label="From date"
        />
        <Input
          type="date"
          className="max-w-[10rem]"
          {...filterDateProps()}
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          aria-label="To date"
        />
        <select
          className={FILTER_SELECT_CLASS}
          {...filterSelectProps()}
          value={hasFoc}
          onChange={(e) => setHasFoc(e.target.value as "" | "yes" | "no")}
        >
          <option value="">FOC bills: all</option>
          <option value="yes">FOC bills only</option>
          <option value="no">No FOC on bill</option>
        </select>
      </ListFilterNav>

      <div className="bg-muted/40 flex flex-wrap gap-6 rounded-lg border px-4 py-3 text-sm">
        <div>
          <span className="text-muted-foreground">Returns</span>{" "}
          <span className="font-semibold tabular-nums">{total}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Total refund</span>{" "}
          <span className="font-semibold tabular-nums">
            {refundTotalSum.toLocaleString(undefined, {
              minimumFractionDigits: 0,
              maximumFractionDigits: 2,
            })}
          </span>
        </div>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-muted-foreground text-sm">No returns found.</p>
      ) : (
        <div className="rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left">
                <th className="px-4 py-2">Return #</th>
                <th className="px-4 py-2">Sale #</th>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Warehouse</th>
                <th className="px-4 py-2 text-right">Refund</th>
                <th className="px-4 py-2">By</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <ListTableRow
                  key={item.id}
                  onActivate={() => navigate(`/sales/returns/${item.id}`)}
                >
                  <td className="px-4 py-2">
                    <ListTableLink to={`/sales/returns/${item.id}`}>
                      {item.returnNumber}
                    </ListTableLink>
                  </td>
                  <td className="px-4 py-2">{item.saleNumber}</td>
                  <td className="px-4 py-2">{item.returnDate}</td>
                  <td className="px-4 py-2">{item.warehouseName}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {item.refundTotal.toFixed(2)}
                  </td>
                  <td className="px-4 py-2">
                    {item.issuedByName ?? "—"}
                  </td>
                </ListTableRow>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
