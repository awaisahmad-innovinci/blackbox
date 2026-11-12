import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type {
  ManagerStockOverviewRow,
  PaginatedManagerStockOverview,
  WarehouseListItem,
} from "@blackbox/shared";
import { Badge } from "@blackbox/ui/badge";
import { Button } from "@blackbox/ui/button";
import { Input } from "@blackbox/ui/input";
import { Label } from "@blackbox/ui/label";
import { getApiErrorMessage } from "@renderer/lib/api/client";
import {
  FILTER_SELECT_CLASS,
  ListFilterNav,
  filterSelectProps,
} from "@renderer/components/list-filter-nav";
import {
  DEFAULT_LIST_PAGE_SIZE,
  ListPagination,
  useResetPageOnFilterChange,
} from "@renderer/components/list-pagination";
import {
  loadManagerStockOverview,
  loadWarehouses,
} from "@renderer/lib/local-db/entity-source";
import { defaultRouteForUser } from "@renderer/lib/sales-access";
import { useSalesAccess } from "@renderer/lib/use-sales-access";
import { useSession } from "@renderer/lib/session/context";

function formatQty(value: number): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });
}

function parseOptionalQtyFilter(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}

function StockHint({ row }: { row: ManagerStockOverviewRow }) {
  if (row.floorQuantity === 0 && row.warehouseQuantity > 0) {
    return (
      <Badge variant="warning" className="mt-1">
        Move to floor
      </Badge>
    );
  }
  if (row.floorQuantity > 0) {
    return (
      <Badge variant="success" className="mt-1">
        On floor
      </Badge>
    );
  }
  return null;
}

export function ManagerStockOverviewPage() {
  const navigate = useNavigate();
  const { user } = useSession();
  const permissions = user?.permissions ?? [];
  const { canAccessStockOverview } = useSalesAccess();
  const [warehouses, setWarehouses] = useState<WarehouseListItem[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [product, setProduct] = useState("");
  const [sku, setSku] = useState("");
  const [search, setSearch] = useState("");
  const [floorQtyAtMostInput, setFloorQtyAtMostInput] = useState("");
  const [warehouseQtyAtMostInput, setWarehouseQtyAtMostInput] = useState("");
  const [result, setResult] = useState<PaginatedManagerStockOverview | null>(
    null,
  );
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_LIST_PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const floorQtyAtMost = useMemo(
    () => parseOptionalQtyFilter(floorQtyAtMostInput),
    [floorQtyAtMostInput],
  );
  const warehouseQtyAtMost = useMemo(
    () => parseOptionalQtyFilter(warehouseQtyAtMostInput),
    [warehouseQtyAtMostInput],
  );

  useEffect(() => {
    if (!canAccessStockOverview) {
      navigate(defaultRouteForUser(permissions), { replace: true });
    }
  }, [canAccessStockOverview, navigate, permissions]);

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
    product,
    sku,
    search,
    floorQtyAtMostInput,
    warehouseQtyAtMostInput,
  ]);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      void loadManagerStockOverview({
        warehouseId: warehouseId || undefined,
        product: product.trim() || undefined,
        sku: sku.trim() || undefined,
        q: search.trim() || undefined,
        floorQtyAtMost,
        warehouseQtyAtMost,
        page,
        pageSize,
      })
        .then((res) => {
          if (!cancelled) {
            setResult(res);
            setError(null);
          }
        })
        .catch((err: unknown) => {
          if (!cancelled) {
            setError(getApiErrorMessage(err, "Failed to load stock overview"));
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
    product,
    sku,
    search,
    floorQtyAtMost,
    warehouseQtyAtMost,
    page,
    pageSize,
  ]);

  const items = result?.items ?? [];
  const total = result?.total ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Floor &amp; warehouse stock
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            POS floor balance vs back-stock per SKU — read-only
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link to="/">Back to dashboard</Link>
        </Button>
      </div>

      <ListFilterNav>
        <Input
          placeholder="Product"
          value={product}
          onChange={(event) => setProduct(event.target.value)}
        />
        <Input
          placeholder="SKU"
          value={sku}
          onChange={(event) => setSku(event.target.value)}
        />
        <Input
          ref={searchRef}
          placeholder="Barcode or variant…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
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
        <div className="space-y-1">
          <Label className="text-muted-foreground text-xs">Min floor qty</Label>
          <Input
            type="number"
            min={0}
            step="any"
            placeholder="At or below…"
            value={floorQtyAtMostInput}
            onChange={(event) => setFloorQtyAtMostInput(event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-muted-foreground text-xs">
            Min warehouse qty
          </Label>
          <Input
            type="number"
            min={0}
            step="any"
            placeholder="At or below…"
            value={warehouseQtyAtMostInput}
            onChange={(event) =>
              setWarehouseQtyAtMostInput(event.target.value)
            }
          />
        </div>
      </ListFilterNav>
      <p className="text-muted-foreground -mt-4 text-xs">
        Min floor / warehouse qty filters show rows with quantity at or below
        the value you enter.
      </p>

      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}

      <div className="border-border overflow-hidden rounded-lg border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Product</th>
              <th className="px-4 py-3 font-medium">SKU</th>
              <th className="px-4 py-3 font-medium">Warehouse</th>
              <th className="px-4 py-3 text-right font-medium">Floor</th>
              <th className="px-4 py-3 text-right font-medium">
                Warehouse stock
              </th>
              <th className="px-4 py-3 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={6}
                  className="text-muted-foreground px-4 py-8 text-center"
                >
                  Loading…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="text-muted-foreground px-4 py-8 text-center"
                >
                  No stock rows found
                </td>
              </tr>
            ) : (
              items.map((row) => (
                <tr
                  key={`${row.productSkuId}-${row.warehouseId}`}
                  className="border-border border-t"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium">{row.productName}</div>
                    {row.variantName ? (
                      <div className="text-muted-foreground text-xs">
                        {row.variantName}
                      </div>
                    ) : null}
                    <StockHint row={row} />
                  </td>
                  <td className="px-4 py-3">
                    <div>{row.sku}</div>
                    {row.barcode ? (
                      <div className="text-muted-foreground text-xs">
                        {row.barcode}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">{row.warehouseName}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatQty(row.floorQuantity)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatQty(row.warehouseQuantity)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatQty(row.totalQuantity)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {result && !loading && items.length > 0 ? (
            <tfoot className="bg-muted/30 text-muted-foreground border-border border-t">
              <tr>
                <td colSpan={3} className="px-4 py-3 font-medium">
                  Totals (filtered)
                </td>
                <td className="px-4 py-3 text-right font-medium tabular-nums">
                  {formatQty(result.floorTotal)}
                </td>
                <td className="px-4 py-3 text-right font-medium tabular-nums">
                  {formatQty(result.warehouseTotal)}
                </td>
                <td className="px-4 py-3 text-right font-medium tabular-nums">
                  {formatQty(result.floorTotal + result.warehouseTotal)}
                </td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>

      <ListPagination
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />
    </div>
  );
}
