import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { EntityStatus } from "@blackbox/shared";
import { Button } from "@blackbox/ui/button";
import { Input } from "@blackbox/ui/input";
import { Skeleton } from "@blackbox/ui/skeleton";
import { getApiErrorMessage } from "@renderer/lib/api/client";
import type { DataSourceMode } from "@renderer/lib/local-db/data-source";
import { useSyncDataVersion } from "@renderer/lib/sync/sync-status";

export type TaxonomyRow = {
  id: string;
  name: string;
  description: string;
  status: EntityStatus;
};

export function TaxonomyListPage({
  title,
  subtitle,
  basePath,
  createLabel,
  emptyLabel,
  load,
}: {
  title: string;
  subtitle: string;
  basePath: string;
  createLabel: string;
  emptyLabel: string;
  load: (query: {
    status?: EntityStatus | "all";
    q?: string;
  }) => Promise<{ rows: TaxonomyRow[]; mode: DataSourceMode }>;
}) {
  const navigate = useNavigate();
  const dataVersion = useSyncDataVersion();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<EntityStatus | "all">("all");
  const [items, setItems] = useState<TaxonomyRow[]>([]);
  const [dataSource, setDataSource] = useState<DataSourceMode>("api");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      setLoading(true);
      setError(null);
      void load({
        status,
        q: search.trim() || undefined,
      })
        .then((result) => {
          if (cancelled) return;
          setItems(result.rows);
          setDataSource(result.mode);
        })
        .catch((err: unknown) => {
          if (!cancelled) {
            setError(getApiErrorMessage(err, `Failed to load ${title.toLowerCase()}`));
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
  }, [search, status, load, title, dataVersion]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{subtitle}</p>
          <p className="text-muted-foreground mt-1 text-xs">
            {dataSource === "local" ? "Showing local data" : "Showing API data"}
          </p>
        </div>
        <Button onClick={() => navigate(`${basePath}/new`)}>{createLabel}</Button>
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
              <th className="px-4 py-3 font-medium">Description</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-border border-t">
                    <td className="px-4 py-3" colSpan={3}>
                      <Skeleton className="h-5 w-full" />
                    </td>
                  </tr>
                ))
              : null}
            {!loading && items.length === 0 ? (
              <tr className="border-border border-t">
                <td
                  colSpan={3}
                  className="text-muted-foreground px-4 py-8 text-center"
                >
                  {emptyLabel}
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
                      <Link
                        to={`${basePath}/${row.id}/edit`}
                        className="text-primary hover:underline"
                      >
                        {row.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      {row.description?.trim() || "—"}
                    </td>
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
