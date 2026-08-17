"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@blackbox/ui/button";
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
import { RequirePermission } from "@/components/require-permission";
import { useAuth } from "@/components/auth-provider";
import { PageHeader } from "@/components/page-header";
import { EmptyState, PageError, TableSkeleton } from "@/components/page-state";
import {
  DataTable,
  Table,
  TBody,
  Td,
  Th,
  THead,
  Tr,
} from "@/components/data-table";
import { RoleTypeBadge } from "@/components/status-badges";
import { FieldHint, FormError } from "@/components/section-card";
import { createRole, listRoles, type RoleDto } from "@/lib/admin-api";
import { toUserFacingError } from "@/lib/api-error";

export default function RolesPage() {
  const { hasPermission } = useAuth();
  const [roles, setRoles] = useState<RoleDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRoles(await listRoles());
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    const form = new FormData(e.currentTarget);
    try {
      await createRole({
        key: String(form.get("key") ?? ""),
        name: String(form.get("name") ?? ""),
      });
      setOpen(false);
      await load();
    } catch (err) {
      setFormError(toUserFacingError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <RequirePermission permissions={["roles.read"]}>
      <div className="bb-page">
        <PageHeader
          title="Roles"
          description="Roles group permission keys. Authorization checks permissions, not role names."
          actions={
            hasPermission("roles.write") ? (
              <Button onClick={() => setOpen(true)}>
                <Plus className="size-4" />
                Create role
              </Button>
            ) : null
          }
        />

        {loading ? <TableSkeleton /> : null}
        {error ? <PageError error={error} onRetry={() => void load()} /> : null}
        {!loading && !error && roles.length === 0 ? (
          <EmptyState
            title="No roles yet"
            message="Create a custom role to group permissions for your team."
            action={
              hasPermission("roles.write") ? (
                <Button onClick={() => setOpen(true)}>
                  <Plus className="size-4" />
                  Create role
                </Button>
              ) : null
            }
          />
        ) : null}

        {!loading && !error && roles.length > 0 ? (
          <DataTable>
            <Table>
              <THead>
                <tr>
                  <Th>Name</Th>
                  <Th>Key</Th>
                  <Th>Type</Th>
                  <Th>Permissions</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </THead>
              <TBody>
                {roles.map((role) => (
                  <Tr key={role.id}>
                    <Td className="font-medium">{role.name}</Td>
                    <Td className="font-mono text-xs">{role.key}</Td>
                    <Td>
                      <RoleTypeBadge isSystem={role.isSystem} />
                    </Td>
                    <Td className="text-muted-foreground">
                      {role.permissionIds.length}
                    </Td>
                    <Td className="text-right">
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/app/roles/${role.id}`}>View</Link>
                      </Button>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </DataTable>
        ) : null}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create custom role</DialogTitle>
            <DialogDescription>
              System roles are seeded at signup. Custom roles belong to this
              workspace only.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={(e) => void onCreate(e)}>
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" required placeholder="Floor lead" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="key">Key</Label>
              <Input id="key" name="key" required placeholder="FLOOR_LEAD" />
              <FieldHint>Stable identifier within this workspace.</FieldHint>
            </div>
            <FormError>{formError}</FormError>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Creating…
                  </>
                ) : (
                  "Create role"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </RequirePermission>
  );
}
