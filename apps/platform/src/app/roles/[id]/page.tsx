"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@blackbox/ui/button";
import { Checkbox } from "@blackbox/ui/checkbox";
import { Input } from "@blackbox/ui/input";
import { Label } from "@blackbox/ui/label";
import { PlatformNav } from "@/components/platform-nav";
import {
  PlatformApiError,
  getPlatformToken,
  getRole,
  listPermissions,
  replaceRolePermissions,
  updateRole,
  type PlatformPermission,
  type PlatformRole,
} from "@/lib/api";

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
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [role, setRole] = useState<PlatformRole | null>(null);
  const [catalog, setCatalog] = useState<PlatformPermission[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(
    async (accessToken: string) => {
      setLoading(true);
      setError(null);
      try {
        const [nextRole, permissions] = await Promise.all([
          getRole(accessToken, params.id),
          listPermissions(accessToken),
        ]);
        setRole(nextRole);
        setName(nextRole.name);
        setKey(nextRole.key);
        setSelected(nextRole.permissionIds);
        setCatalog(permissions);
      } catch (err) {
        setError(err instanceof PlatformApiError ? err.message : "Could not load this role");
      } finally {
        setLoading(false);
      }
    },
    [params.id],
  );

  useEffect(() => {
    const accessToken = getPlatformToken();
    if (!accessToken) {
      router.replace("/");
      return;
    }
    setToken(accessToken);
    void load(accessToken);
  }, [load, router]);

  const grouped = useMemo(() => {
    const map = new Map<string, PlatformPermission[]>();
    for (const perm of catalog) {
      const group = groupKey(perm.key);
      const list = map.get(group) ?? [];
      list.push(perm);
      map.set(group, list);
    }
    return [...map.entries()];
  }, [catalog]);

  async function onSaveDetails(event: FormEvent) {
    event.preventDefault();
    if (!token || !role) return;
    setBusy(true);
    setSuccess(null);
    setError(null);
    try {
      const updated = await updateRole(token, role.id, {
        name: name.trim(),
        ...(role.isSystem ? {} : { key: key.trim() }),
      });
      setRole(updated);
      setName(updated.name);
      setKey(updated.key);
      setSuccess("Role saved. This applies to every tenant.");
    } catch (err) {
      setError(err instanceof PlatformApiError ? err.message : "Could not save the role");
    } finally {
      setBusy(false);
    }
  }

  async function onSavePermissions() {
    if (!token || !role) return;
    setBusy(true);
    setSuccess(null);
    setError(null);
    try {
      const updated = await replaceRolePermissions(token, role.id, selected);
      setRole(updated);
      setSelected(updated.permissionIds);
      setSuccess("Permissions updated. This applies to every tenant.");
    } catch (err) {
      setError(
        err instanceof PlatformApiError ? err.message : "Could not save permissions",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!token) return null;

  return (
    <div className="bb-page mx-auto max-w-3xl px-6 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/roles">
            <ArrowLeft className="size-3.5" />
            Roles
          </Link>
        </Button>
        <PlatformNav />
      </header>

      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          {role?.name ?? "Role"}
        </h1>
        {role ? (
          <p className="text-muted-foreground mt-1 font-mono text-xs">
            {role.key}
            {role.isSystem ? " · System" : ""}
          </p>
        ) : null}
      </div>

      {loading ? (
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" />
          Loading role…
        </p>
      ) : null}
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      {success ? <p className="text-sm">{success}</p> : null}

      {role && !loading ? (
        <>
          <form className="space-y-4" onSubmit={(event) => void onSaveDetails(event)}>
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="key">Key</Label>
              <Input
                id="key"
                required
                value={key}
                disabled={role.isSystem}
                onChange={(event) => setKey(event.target.value)}
              />
              {role.isSystem ? (
                <p className="text-muted-foreground text-xs">
                  System role keys cannot be changed.
                </p>
              ) : null}
            </div>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save changes"}
            </Button>
          </form>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-medium">
                Permissions
                <span className="text-muted-foreground ml-2 text-sm font-normal">
                  {selected.length} selected of {catalog.length}
                </span>
              </h2>
              <Button type="button" disabled={busy} onClick={() => void onSavePermissions()}>
                Save permissions
              </Button>
            </div>
            <div className="max-h-[32rem] space-y-5 overflow-y-auto">
              {grouped.map(([group, perms]) => (
                <div key={group} className="space-y-2">
                  <p className="text-muted-foreground text-[11px] font-medium tracking-[0.14em] uppercase">
                    {group}
                  </p>
                  {perms.map((perm) => (
                    <label
                      key={perm.id}
                      className="hover:bg-muted/50 flex items-start gap-3 rounded-md px-2 py-2 text-sm"
                    >
                      <Checkbox
                        className="mt-0.5"
                        checked={selected.includes(perm.id)}
                        onCheckedChange={(checked) => {
                          setSelected((current) =>
                            checked
                              ? [...current, perm.id]
                              : current.filter((id) => id !== perm.id),
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
              ))}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
