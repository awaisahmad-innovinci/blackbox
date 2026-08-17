"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@blackbox/ui/button";
import { Checkbox } from "@blackbox/ui/checkbox";
import { Input } from "@blackbox/ui/input";
import { Label } from "@blackbox/ui/label";
import { RequirePermission } from "@/components/require-permission";
import { useAuth } from "@/components/auth-provider";
import { PageHeader } from "@/components/page-header";
import { LoadingState, PageError } from "@/components/page-state";
import { RoleTypeBadge } from "@/components/status-badges";
import {
  FieldHint,
  FormError,
  FormSuccess,
  SectionCard,
} from "@/components/section-card";
import {
  getRole,
  listPermissions,
  replaceRolePermissions,
  updateRole,
  type PermissionDto,
  type RoleDto,
} from "@/lib/admin-api";
import { toUserFacingError } from "@/lib/api-error";

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

export default function RoleDetailPage() {
  const params = useParams<{ id: string }>();
  const { hasPermission } = useAuth();
  const [role, setRole] = useState<RoleDto | null>(null);
  const [catalog, setCatalog] = useState<PermissionDto[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [r, perms] = await Promise.all([
        getRole(params.id),
        listPermissions().catch(() => [] as PermissionDto[]),
      ]);
      setRole(r);
      setCatalog(perms);
      setSelected(r.permissionIds);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = useMemo(() => {
    const map = new Map<string, PermissionDto[]>();
    for (const perm of catalog) {
      const g = groupKey(perm.key);
      const list = map.get(g) ?? [];
      list.push(perm);
      map.set(g, list);
    }
    return [...map.entries()];
  }, [catalog]);

  async function onSaveMeta(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!role) return;
    setBusy(true);
    setSuccess(null);
    setFormError(null);
    const form = new FormData(e.currentTarget);
    try {
      const body: { name?: string; key?: string } = {
        name: String(form.get("name") ?? ""),
      };
      if (!role.isSystem) {
        body.key = String(form.get("key") ?? "");
      }
      const updated = await updateRole(role.id, body);
      setRole(updated);
      setSuccess("Role saved.");
    } catch (err) {
      setFormError(toUserFacingError(err));
    } finally {
      setBusy(false);
    }
  }

  async function onSavePermissions() {
    if (!role) return;
    setBusy(true);
    setSuccess(null);
    setFormError(null);
    try {
      const updated = await replaceRolePermissions(role.id, selected);
      setRole(updated);
      setSelected(updated.permissionIds);
      setSuccess("Permissions updated.");
    } catch (err) {
      setFormError(toUserFacingError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <RequirePermission permissions={["roles.read"]}>
      <div className="bb-page-narrow">
        <PageHeader
          breadcrumb={
            <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
              <Link href="/app/roles">
                <ArrowLeft className="size-3.5" />
                Roles
              </Link>
            </Button>
          }
          title={role?.name ?? "Role"}
          description={
            role ? (
              <span className="font-mono text-xs">{role.key}</span>
            ) : undefined
          }
          actions={role ? <RoleTypeBadge isSystem={role.isSystem} /> : null}
        />

        {loading ? <LoadingState /> : null}
        {error ? <PageError error={error} onRetry={() => void load()} /> : null}

        {role && !loading ? (
          <>
            <FormSuccess>{success}</FormSuccess>
            <FormError>{formError}</FormError>

            <SectionCard title="Details">
              {hasPermission("roles.write") ? (
                <form className="space-y-4" onSubmit={(e) => void onSaveMeta(e)}>
                  <div className="space-y-2">
                    <Label htmlFor="name">Name</Label>
                    <Input
                      id="name"
                      name="name"
                      defaultValue={role.name}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="key">Key</Label>
                    <Input
                      id="key"
                      name="key"
                      defaultValue={role.key}
                      required
                      disabled={role.isSystem}
                    />
                    {role.isSystem ? (
                      <FieldHint>System role keys cannot be changed.</FieldHint>
                    ) : null}
                  </div>
                  <Button type="submit" disabled={busy}>
                    {busy ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Saving…
                      </>
                    ) : (
                      "Save changes"
                    )}
                  </Button>
                </form>
              ) : (
                <p className="text-sm">
                  <span className="text-muted-foreground">Key:</span>{" "}
                  <span className="font-mono text-xs">{role.key}</span>
                </p>
              )}
            </SectionCard>

            <SectionCard
              title="Permissions"
              description={`${selected.length} selected of ${catalog.length}`}
              footer={
                hasPermission("roles.write") ? (
                  <Button disabled={busy} onClick={() => void onSavePermissions()}>
                    Save permissions
                  </Button>
                ) : null
              }
            >
              <div className="max-h-[28rem] space-y-5 overflow-y-auto pr-1">
                {grouped.map(([group, perms]) => (
                  <div key={group} className="space-y-2">
                    <p className="text-muted-foreground text-[11px] font-medium tracking-[0.14em] uppercase">
                      {group}
                    </p>
                    <div className="space-y-1">
                      {perms.map((perm) => (
                        <label
                          key={perm.id}
                          className="hover:bg-muted/50 flex items-start gap-3 rounded-md px-2 py-2 text-sm"
                        >
                          <Checkbox
                            className="mt-0.5"
                            checked={selected.includes(perm.id)}
                            disabled={!hasPermission("roles.write")}
                            onCheckedChange={(checked) => {
                              setSelected((prev) =>
                                checked
                                  ? [...prev, perm.id]
                                  : prev.filter((id) => id !== perm.id),
                              );
                            }}
                          />
                          <span className="min-w-0">
                            <span className="font-mono text-xs">{perm.key}</span>
                            <span className="text-muted-foreground block text-xs leading-relaxed">
                              {perm.description}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          </>
        ) : null}
      </div>
    </RequirePermission>
  );
}
