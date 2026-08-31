import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { EntityStatus, WarehouseListItem } from "@blackbox/shared";
import { Button } from "@blackbox/ui/button";
import { Input } from "@blackbox/ui/input";
import { Skeleton } from "@blackbox/ui/skeleton";
import { getApiErrorMessage } from "@renderer/lib/api/client";
import { warehousesApi } from "@renderer/lib/api/warehouses";
import {
  resolveDataSourceMode,
  type DataSourceMode,
} from "@renderer/lib/local-db/data-source";
import { useSession } from "@renderer/lib/session/context";
import { useSyncDataVersion } from "@renderer/lib/sync/sync-status";

export function WarehousesListPage() {
  const navigate = useNavigate();
  const { user } = useSession();
  const canWrite = Boolean(user?.permissions.includes("warehouses.write"));
  const dataVersion = useSyncDataVersion();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<EntityStatus | "all">("all");
  const [items, setItems] = useState<WarehouseListItem[]>([]);
  const [dataSource, setDataSource] = useState<DataSourceMode>("api");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
            status,
            q: search.trim() || undefined,
          };
          let rows: WarehouseListItem[];
          if (mode === "local" && window.blackbox?.localDb?.listWarehouses) {
            const local = await window.blackbox.localDb.listWarehouses(status);
            const term = search.trim().toLowerCase();
            rows = term
              ? local.filter(
                  (row) =>
                    row.name.toLowerCase().includes(term) ||
                    row.code.toLowerCase().includes(term) ||
                    (row.location ?? "").toLowerCase().includes(term),
                )
              : local;
          } else {
            rows = await warehousesApi.list(query);
          }
          if (!cancelled) setItems(rows);
        } catch (err: unknown) {
          if (!cancelled) {
            setError(getApiErrorMessage(err, "Failed to load warehouses"));
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [search, status, dataVersion]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Warehouses</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Store locations used on purchase orders and stock movements.
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            {dataSource === "local" ? "Showing local data" : "Showing API data"}
          </p>
        </div>
        {canWrite ? (
          <Button onClick={() => navigate("/warehouses/new")}>
            + Create Warehouse
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-3">
        <Input
          className="max-w-xs"
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="border-input bg-background h-9 rounded-md border px-3 text-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value as EntityStatus | "all")}
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
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
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Code</th>
              <th className="px-4 py-3 font-medium">Location</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-border border-t">
                    <td className="px-4 py-3" colSpan={4}>
                      <Skeleton className="h-5 w-full" />
                    </td>
                  </tr>
                ))
              : null}
            {!loading && items.length === 0 ? (
              <tr className="border-border border-t">
                <td
                  colSpan={4}
                  className="text-muted-foreground px-4 py-8 text-center"
                >
                  No warehouses found.
                </td>
              </tr>
            ) : null}
            {!loading
              ? items.map((row) => (
                  <tr
                    key={row.id}
                    className="border-border hover:bg-muted/30 border-t"
                  >
                    <td className="px-4 py-3 font-medium">
                      {canWrite ? (
                        <Link
                          to={`/warehouses/${row.id}/edit`}
                          className="text-primary hover:underline"
                        >
                          {row.name}
                        </Link>
                      ) : (
                        row.name
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{row.code}</td>
                    <td className="px-4 py-3">{row.location?.trim() || "—"}</td>
                    <td className="px-4 py-3 capitalize">{row.status}</td>
                  </tr>
                ))
              : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
