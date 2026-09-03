import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type {
  VendorListItem,
  VendorReturnListItem,
  VendorReturnStatus,
} from "@blackbox/shared";
import { VENDOR_RETURN_STATUSES } from "@blackbox/shared";
import { Button } from "@blackbox/ui/button";
import { Input } from "@blackbox/ui/input";
import { Label } from "@blackbox/ui/label";
import { getApiErrorMessage } from "@renderer/lib/api/client";
import { loadVendorReturns, loadVendors } from "@renderer/lib/local-db/entity-source";
import { useBarcodeScanTarget } from "@renderer/lib/barcode-scan";
import {
  DEFAULT_LIST_PAGE_SIZE,
  ListPagination,
  useResetPageOnFilterChange,
} from "@renderer/components/list-pagination";

export function VendorReturnsListPage() {
  const navigate = useNavigate();
  const [vendors, setVendors] = useState<VendorListItem[]>([]);
  const [vendorId, setVendorId] = useState("");
  const [status, setStatus] = useState<VendorReturnStatus | "">("");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<VendorReturnListItem[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_LIST_PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useBarcodeScanTarget({
    kind: "search",
    enabled: true,
    onScan: setSearch,
  });

  useEffect(() => {
    void loadVendors({ status: "active", pageSize: 100 })
      .then((r) => setVendors(r.items))
      .catch(() => undefined);
  }, []);

  useResetPageOnFilterChange(setPage, [vendorId, status, search]);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      setLoading(true);
      void loadVendorReturns({
        vendorId: vendorId || undefined,
        status: status || undefined,
        search: search.trim() || undefined,
        page,
        pageSize,
      })
        .then((res) => {
          if (!cancelled) {
            setItems(res.items);
            setTotal(res.total);
          }
        })
        .catch((err: unknown) => {
          if (!cancelled) {
            setError(getApiErrorMessage(err, "Failed to load vendor returns"));
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
  }, [vendorId, status, search, page, pageSize]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Vendor Returns
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Record expired or damaged stock returned to a vendor.
          </p>
        </div>
        <Button onClick={() => navigate("/inventory/returns/new")}>
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

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Vendor</Label>
          <select
            className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
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
        </div>
        <div className="space-y-1.5">
          <Label>Status</Label>
          <select
            className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
            value={status}
            onChange={(e) =>
              setStatus(e.target.value as VendorReturnStatus | "")
            }
          >
            <option value="">All</option>
            {VENDOR_RETURN_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Search</Label>
          <Input
            data-barcode-scan=""
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Return # or vendor"
          />
        </div>
      </section>

      <div className="border-border overflow-hidden rounded-lg border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Return #</th>
              <th className="px-4 py-3 font-medium">Vendor</th>
              <th className="px-4 py-3 font-medium">Warehouse</th>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Total</th>
              <th className="px-4 py-3 font-medium">Items</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="text-muted-foreground px-4 py-6">
                  Loading…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-muted-foreground px-4 py-6">
                  No vendor returns found.
                </td>
              </tr>
            ) : (
              items.map((row) => (
                <tr key={row.id} className="border-border border-t">
                  <td className="px-4 py-3">
                    <Link
                      to={`/inventory/returns/${row.id}`}
                      className="text-primary font-medium hover:underline"
                    >
                      {row.returnNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{row.vendorName}</td>
                  <td className="px-4 py-3">{row.warehouseName}</td>
                  <td className="px-4 py-3 tabular-nums">{row.returnDate}</td>
                  <td className="px-4 py-3">{row.status}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {row.total.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{row.itemCount}</td>
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
