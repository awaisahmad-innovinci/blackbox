import { useEffect, useMemo, useRef, useState } from "react";
import { formatMoney } from "@blackbox/shared";
import { Link, useNavigate } from "react-router-dom";
import {
  SALE_REGISTER_STATUSES,
  type FbrInvoiceStatus,
  type SaleRegisterItem,
  type SaleRegisterKind,
  type WarehouseListItem,
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
  filterDateProps,
  filterSelectProps,
  ListFilterNav,
} from "@renderer/components/list-filter-nav";
import {
  loadSaleRegister,
  loadWarehouses,
  resolveSaleByNumber,
  resolveSaleReturnByNumber,
} from "@renderer/lib/local-db/entity-source";
import { barcodeScanInputProps, useBarcodeScanTarget } from "@renderer/lib/barcode-scan";
import {
  DEFAULT_LIST_PAGE_SIZE,
  ListPagination,
  useResetPageOnFilterChange,
} from "@renderer/components/list-pagination";
import { useSalesAccess } from "@renderer/lib/use-sales-access";
import { defaultRouteForUser } from "@renderer/lib/sales-access";
import { useSession } from "@renderer/lib/session/context";

function SaleBillBadge({ status }: { status?: FbrInvoiceStatus | null }) {
  if (status === "excluded") {
    return (
      <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-xs font-medium">
        Simple
      </span>
    );
  }
  if (status === "pending" || status === "submitted" || status === "failed") {
    return (
      <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-xs font-medium text-emerald-800 dark:text-emerald-200">
        FBR
      </span>
    );
  }
  return <span className="text-muted-foreground">—</span>;
}

function documentPath(item: SaleRegisterItem): string {
  return item.kind === "return"
    ? `/sales/returns/${item.id}`
    : `/sales/${item.id}`;
}

function when(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export function SalesListPage() {
  const navigate = useNavigate();
  const { user } = useSession();
  const { canReadList, canWrite, canReturn, canAccessStockOverview } =
    useSalesAccess();
  const [warehouses, setWarehouses] = useState<WarehouseListItem[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [kind, setKind] = useState<"" | SaleRegisterKind>("");
  const [status, setStatus] = useState("");
  const [hasFoc, setHasFoc] = useState<"" | "yes" | "no">("");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<SaleRegisterItem[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_LIST_PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const showBillMode = user?.fbrEnabled === true;
  const columnCount = showBillMode ? 8 : 7;
  const kindFilter: SaleRegisterKind | undefined =
    canReadList && canReturn
      ? kind || undefined
      : canReturn
        ? "return"
        : "sale";
  const statusOptions = useMemo(
    () =>
      SALE_REGISTER_STATUSES.filter((value) => {
        const saleStatus =
          value === "DRAFT" || value === "POSTED" || value === "VOID";
        if (!canReadList && saleStatus) return false;
        if (!canReturn && !saleStatus) return false;
        if (kindFilter === "sale" && !saleStatus) return false;
        if (kindFilter === "return" && saleStatus) return false;
        return true;
      }),
    [canReadList, canReturn, kindFilter],
  );

  useEffect(() => {
    if (!canReadList && !canReturn) {
      navigate(defaultRouteForUser(user?.permissions ?? []), { replace: true });
    }
  }, [canReadList, canReturn, navigate, user?.permissions]);

  useBarcodeScanTarget({
    kind: "search",
    enabled: true,
    inputRef: searchRef,
    onScan: setSearch,
    onComplete: (code) => {
      void (async () => {
        if (canReadList) {
          const sale = await resolveSaleByNumber(code);
          if (sale) {
            navigate(`/sales/${sale.id}`);
            return;
          }
        }
        if (canReturn) {
          const saleReturn = await resolveSaleReturnByNumber(code);
          if (saleReturn) {
            navigate(`/sales/returns/${saleReturn.id}`);
            return;
          }
        }
        setError(`Not found: ${code.trim()}`);
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
    kind,
    status,
    hasFoc,
  ]);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      const statusQuery = statusOptions.includes(
        status as (typeof SALE_REGISTER_STATUSES)[number],
      )
        ? status
        : undefined;
      void loadSaleRegister({
        warehouseId: warehouseId || undefined,
        search: search.trim() || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        kind: kindFilter,
        status: statusQuery,
        hasFoc: hasFoc === "" ? undefined : hasFoc === "yes",
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
  }, [
    warehouseId,
    search,
    dateFrom,
    dateTo,
    kindFilter,
    status,
    statusOptions,
    hasFoc,
    page,
    pageSize,
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Sales</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Posted bills and customer returns
          </p>
        </div>
        {canWrite || canReturn ? (
          <div className="flex gap-2">
            {canReturn ? (
              <Button
                variant="outline"
                onClick={() => navigate("/sales/returns/new")}
              >
                New return
              </Button>
            ) : null}
            {canWrite ? (
              <>
                <Button variant="outline" onClick={() => navigate("/sales/held")}>
                  Held bills
                </Button>
                <Button onClick={() => navigate("/sales/new")}>New sale</Button>
              </>
            ) : null}
          </div>
        ) : canAccessStockOverview ? (
          <Button variant="outline" asChild>
            <Link to="/sales/stock-overview">Floor &amp; warehouse stock</Link>
          </Button>
        ) : null}
      </div>

      <ListFilterNav>
        <Input
          ref={searchRef}
          placeholder="Search sale or return number…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          {...barcodeScanInputProps}
        />
        {canReadList && canReturn ? (
          <select
            className={FILTER_SELECT_CLASS}
            value={kind}
            onChange={(event) => {
              const next = event.target.value as "" | SaleRegisterKind;
              setKind(next);
              if (
                next === "sale" &&
                (status === "PENDING" || status === "COMPLETED")
              ) {
                setStatus("");
              }
              if (
                next === "return" &&
                (status === "DRAFT" || status === "POSTED" || status === "VOID")
              ) {
                setStatus("");
              }
            }}
            {...filterSelectProps}
          >
            <option value="">All types</option>
            <option value="sale">Sale</option>
            <option value="return">Return</option>
          </select>
        ) : null}
        <select
          className={FILTER_SELECT_CLASS}
          value={statusOptions.includes(status as (typeof SALE_REGISTER_STATUSES)[number]) ? status : ""}
          onChange={(event) => setStatus(event.target.value)}
          {...filterSelectProps}
        >
          <option value="">All statuses</option>
          {statusOptions.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
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
        <Input
          type="date"
          className="w-auto"
          {...filterDateProps()}
          value={dateFrom}
          onChange={(event) => setDateFrom(event.target.value)}
          aria-label="From date"
        />
        <Input
          type="date"
          className="w-auto"
          {...filterDateProps()}
          value={dateTo}
          onChange={(event) => setDateTo(event.target.value)}
          aria-label="To date"
        />
        <select
          className={FILTER_SELECT_CLASS}
          value={hasFoc}
          onChange={(event) => setHasFoc(event.target.value as "" | "yes" | "no")}
          {...filterSelectProps}
        >
          <option value="">FOC bills: all</option>
          <option value="yes">FOC bills only</option>
          <option value="no">No FOC on bill</option>
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
              <th className="px-4 py-3 font-medium">Number</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Warehouse</th>
              <th className="px-4 py-3 font-medium">Status</th>
              {showBillMode ? (
                <th className="px-4 py-3 font-medium">Bill</th>
              ) : null}
              <th className="px-4 py-3 font-medium">Items</th>
              <th className="px-4 py-3 font-medium">Total</th>
              <th className="px-4 py-3 font-medium">When</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columnCount} className="text-muted-foreground px-4 py-8 text-center">
                  Loading…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={columnCount} className="text-muted-foreground px-4 py-8 text-center">
                  No sales or returns found
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <ListTableRow
                  key={`${item.kind}-${item.id}`}
                  onActivate={() => navigate(documentPath(item))}
                >
                  <td className="px-4 py-3">
                    <ListTableLink to={documentPath(item)}>
                      {item.number}
                    </ListTableLink>
                    {item.kind === "return" && item.relatedSaleNumber ? (
                      <div className="text-muted-foreground text-xs">
                        Sale {item.relatedSaleNumber}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    {item.kind === "return" ? "Return" : "Sale"}
                  </td>
                  <td className="px-4 py-3">{item.warehouseName}</td>
                  <td className="px-4 py-3">{item.status}</td>
                  {showBillMode ? (
                    <td className="px-4 py-3">
                      {item.kind === "sale" ? (
                        <SaleBillBadge status={item.fbrStatus} />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  ) : null}
                  <td className="px-4 py-3 tabular-nums">{item.itemCount}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {formatMoney(item.amount)}
                  </td>
                  <td className="px-4 py-3">{when(item.at)}</td>
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
