"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RequirePermission } from "@/components/require-permission";
import { PageHeader } from "@/components/page-header";
import { EmptyState, PageError, TableSkeleton } from "@/components/page-state";
import { SectionCard } from "@/components/section-card";
import { listPermissions, type PermissionDto } from "@/lib/admin-api";

function groupKey(key: string): string {
  const prefix = key.split(".")[0] ?? "other";
  const labels: Record<string, string> = {
    web: "Web",
    desktop: "Desktop",
    users: "Users",
    roles: "Roles",
    permissions: "Permissions",
    devices: "Devices",
    tenant: "Tenant",
  };
  return labels[prefix] ?? prefix;
}

export default function PermissionsPage() {
  const [rows, setRows] = useState<PermissionDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await listPermissions());
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = useMemo(() => {
    const map = new Map<string, PermissionDto[]>();
    for (const row of rows) {
      const g = groupKey(row.key);
      const list = map.get(g) ?? [];
      list.push(row);
      map.set(g, list);
    }
    return [...map.entries()];
  }, [rows]);

  return (
    <RequirePermission permissions={["permissions.read"]}>
      <div className="bb-page">
        <PageHeader
          title="Permissions"
          description="Global permission catalog (read-only). Authorization always checks these keys."
        />

        {loading ? <TableSkeleton rows={6} /> : null}
        {error ? <PageError error={error} onRetry={() => void load()} /> : null}
        {!loading && !error && rows.length === 0 ? (
          <EmptyState
            title="No permissions"
            message="The permission catalog is empty. Run database migrations."
          />
        ) : null}

        {!loading && !error && rows.length > 0 ? (
          <div className="space-y-4">
            {grouped.map(([group, perms]) => (
              <SectionCard key={group} title={group}>
                <ul className="divide-border/80 divide-y">
                  {perms.map((row) => (
                    <li
                      key={row.id}
                      className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-6"
                    >
                      <code className="bg-muted rounded-md px-2 py-1 font-mono text-xs">
                        {row.key}
                      </code>
                      <p className="text-muted-foreground text-sm leading-relaxed sm:max-w-xl sm:text-right">
                        {row.description}
                      </p>
                    </li>
                  ))}
                </ul>
              </SectionCard>
            ))}
          </div>
        ) : null}
      </div>
    </RequirePermission>
  );
}
