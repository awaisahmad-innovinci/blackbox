"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@blackbox/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@blackbox/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@blackbox/ui/dialog";
import { Input } from "@blackbox/ui/input";
import { Label } from "@blackbox/ui/label";
import { PlatformNav } from "@/components/platform-nav";
import {
  PlatformApiError,
  createRole,
  getPlatformToken,
  listRoles,
  type PlatformRole,
} from "@/lib/api";

export default function RolesPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [roles, setRoles] = useState<PlatformRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async (accessToken: string) => {
    setLoading(true);
    setError(null);
    try {
      setRoles(await listRoles(accessToken));
    } catch (err) {
      setError(err instanceof PlatformApiError ? err.message : "Could not load roles");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const accessToken = getPlatformToken();
    if (!accessToken) {
      router.replace("/");
      return;
    }
    setToken(accessToken);
    void load(accessToken);
  }, [load, router]);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    if (!token) return;
    setSaving(true);
    setFormError(null);
    try {
      await createRole(token, { key: key.trim(), name: name.trim() });
      setOpen(false);
      setName("");
      setKey("");
      await load(token);
    } catch (err) {
      setFormError(
        err instanceof PlatformApiError ? err.message : "Could not create the role",
      );
    } finally {
      setSaving(false);
    }
  }

  if (!token) return null;

  return (
    <div className="bb-page px-6 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Roles
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            One catalog for every tenant. Assigning a role to a person stays on the tenant site.
          </p>
        </div>
        <PlatformNav />
      </header>

      <div className="flex justify-end">
        <Button type="button" onClick={() => setOpen(true)}>
          <Plus className="size-4" />
          Create role
        </Button>
      </div>

      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      {loading ? (
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" />
          Loading roles…
        </p>
      ) : null}

      {!loading && roles.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No roles yet</CardTitle>
            <CardDescription>
              Create a role, then choose which permissions it grants.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {!loading && roles.length > 0 ? (
        <Card>
          <CardContent className="px-0">
            <table className="w-full text-left text-sm">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="px-6 py-3 font-medium">Name</th>
                  <th className="px-6 py-3 font-medium">Key</th>
                  <th className="px-6 py-3 font-medium">Type</th>
                  <th className="px-6 py-3 font-medium">Permissions</th>
                  <th className="px-6 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {roles.map((role) => (
                  <tr key={role.id} className="border-border border-t">
                    <td className="px-6 py-3 font-medium">{role.name}</td>
                    <td className="px-6 py-3 font-mono text-xs">{role.key}</td>
                    <td className="px-6 py-3">
                      {role.isSystem ? "System" : "Custom"}
                    </td>
                    <td className="text-muted-foreground px-6 py-3">
                      {role.permissionIds.length}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/roles/${role.id}`}>Edit</Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create role</DialogTitle>
            <DialogDescription>
              This role can be assigned in every tenant.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={(event) => void onCreate(event)}>
            <div className="space-y-2">
              <Label htmlFor="role-name">Name</Label>
              <Input
                id="role-name"
                required
                value={name}
                placeholder="Floor lead"
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role-key">Key</Label>
              <Input
                id="role-key"
                required
                value={key}
                placeholder="FLOOR_LEAD"
                onChange={(event) => setKey(event.target.value)}
              />
              <p className="text-muted-foreground text-xs">
                Letters, numbers, dots, underscores, and hyphens. The key cannot change after the role is a system role.
              </p>
            </div>
            {formError ? (
              <p className="text-destructive text-sm">{formError}</p>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Creating…" : "Create role"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
