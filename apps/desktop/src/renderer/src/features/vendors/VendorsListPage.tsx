import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { EntityStatus, VendorGroup, VendorListItem, VendorListQuery } from "@blackbox/shared";
import { Button } from "@blackbox/ui/button";
import { Input } from "@blackbox/ui/input";
import { Skeleton } from "@blackbox/ui/skeleton";
import { ApiError } from "@renderer/lib/api/client";
import { vendorGroupsApi } from "@renderer/lib/api/vendor-groups";
import { vendorsApi } from "@renderer/lib/api/vendors";
import {
  resolveDataSourceMode,
  type DataSourceMode,
} from "@renderer/lib/local-db/data-source";
import { useSyncDataVersion } from "@renderer/lib/sync/sync-status";
import { useBarcodeScanTarget } from "@renderer/lib/barcode-scan";
import {
  DEFAULT_LIST_PAGE_SIZE,
  ListPagination,
  useResetPageOnFilterChange,
} from "@renderer/components/list-pagination";

export function VendorsListPage() {
  const navigate = useNavigate();
  const dataVersion = useSyncDataVersion();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<EntityStatus | "">("");
  const [groupId, setGroupId] = useState("");
  const [groups, setGroups] = useState<VendorGroup[]>([]);
  const [items, setItems] = useState<VendorListItem[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_LIST_PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dataSource, setDataSource] = useState<DataSourceMode>("api");

  useBarcodeScanTarget({
    kind: "search",
    enabled: true,
    onScan: setSearch,
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const mode = await resolveDataSourceMode();
      if (cancelled) return;
      setDataSource(mode);
      try {
        if (mode === "local" && window.blackbox?.localDb?.listVendorGroups) {
          setGroups(await window.blackbox.localDb.listVendorGroups());
        } else {
          setGroups(await vendorGroupsApi.list());
        }
      } catch {
        /* filters optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dataVersion]);

  useResetPageOnFilterChange(setPage, [search, status, groupId, dataVersion]);

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
          const query: VendorListQuery = {
            search: search.trim() || undefined,
            status: status || "all",
            groupId: groupId || undefined,
            page,
            pageSize,
          };
          const res =
            mode === "local" && window.blackbox?.localDb?.listVendors
              ? await window.blackbox.localDb.listVendors(query)
              : await vendorsApi.list(query);
          if (!cancelled) {
            setItems(res.items);
            setTotal(res.total);
          }
        } catch (err: unknown) {
          if (cancelled) return;
          setError(
            err instanceof ApiError ? err.message : "Failed to load vendors",
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
  }, [search, status, groupId, dataVersion, page, pageSize]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Vendors</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Suppliers for this store.
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            {dataSource === "local"
              ? "Showing local data"
              : "Showing API data"}
          </p>
        </div>
        <Button onClick={() => navigate("/vendors/new")}>+ Add Vendor</Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <Input
          className="max-w-xs"
          placeholder="Search vendors..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="border-input bg-background h-9 rounded-md border px-3 text-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value as EntityStatus | "")}
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <select
          className="border-input bg-background h-9 rounded-md border px-3 text-sm"
          value={groupId}
          onChange={(e) => setGroupId(e.target.value)}
        >
          <option value="">All groups</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
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
              <th className="px-4 py-3 font-medium">Vendor</th>
              <th className="px-4 py-3 font-medium">Code</th>
              <th className="px-4 py-3 font-medium">Group</th>
              <th className="px-4 py-3 font-medium">Primary Contact</th>
              <th className="px-4 py-3 font-medium">Phone</th>
              <th className="px-4 py-3 font-medium">City</th>
              <th className="px-4 py-3 font-medium">SKUs</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-border border-t">
                    <td className="px-4 py-3" colSpan={8}>
                      <Skeleton className="h-5 w-full" />
                    </td>
                  </tr>
                ))
              : null}
            {!loading && items.length === 0 ? (
              <tr className="border-border border-t">
                <td
                  colSpan={8}
                  className="text-muted-foreground px-4 py-8 text-center"
                >
                  No vendors found.
                </td>
              </tr>
            ) : null}
            {!loading
              ? items.map((v) => (
                  <tr
                    key={v.id}
                    className="border-border hover:bg-muted/30 border-t"
                  >
                    <td className="px-4 py-3 font-medium">
                      <Link
                        to={`/vendors/${v.id}`}
                        className="text-primary hover:underline"
                      >
                        {v.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{v.vendorCode}</td>
                    <td className="px-4 py-3">{v.groupName ?? "—"}</td>
                    <td className="px-4 py-3">{v.primaryContactName ?? "—"}</td>
                    <td className="px-4 py-3">{v.primaryContactPhone ?? "—"}</td>
                    <td className="px-4 py-3">{v.city ?? "—"}</td>
                    <td className="px-4 py-3 tabular-nums">{v.suppliedSkuCount}</td>
                    <td className="px-4 py-3 capitalize">{v.status}</td>
                  </tr>
                ))
              : null}
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
