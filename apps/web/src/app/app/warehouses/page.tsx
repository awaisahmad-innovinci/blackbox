"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Search } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@blackbox/ui/alert";
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
import { ConfirmDialog } from "@/components/confirm-dialog";
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
import { ActiveBadge } from "@/components/status-badges";
import { FormError } from "@/components/section-card";
import {
  createWarehouse,
  deactivateWarehouse,
  listWarehouses,
  updateWarehouse,
  type WarehouseDto,
} from "@/lib/admin-api";
import { ApiError, toUserFacingError } from "@/lib/api-error";
import { normalizeStoredText } from "@blackbox/shared";

const emptyDraft = {
  name: "",
  code: "",
  location: "",
  status: "active" as "active" | "inactive",
};

function warehouseFormError(error: unknown): string {
  if (error instanceof ApiError && error.status === 409) {
    return "A warehouse with this code already exists in this workspace.";
  }
  return toUserFacingError(error);
}

export default function WarehousesPage() {
  const [items, setItems] = useState<WarehouseDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<WarehouseDto | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<WarehouseDto | null>(
    null,
  );
  const createButtonRef = useRef<HTMLButtonElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await listWarehouses({ status: "all" }));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => nameRef.current?.focus(), 50);
    return () => window.clearTimeout(id);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((row) => {
      if (status !== "all" && row.status !== status) return false;
      if (!q) return true;
      return (
        row.name.toLowerCase().includes(q) ||
        row.code.toLowerCase().includes(q) ||
        (row.location ?? "").toLowerCase().includes(q)
      );
    });
  }, [items, query, status]);

  function openCreate() {
    setSuccess(null);
    setFormError(null);
    setEditing(null);
    setDraft(emptyDraft);
    setOpen(true);
  }

  function openEdit(row: WarehouseDto) {
    setSuccess(null);
    setFormError(null);
    setEditing(row);
    setDraft({
      name: row.name,
      code: row.code,
      location: row.location ?? "",
      status: row.status,
    });
    setOpen(true);
  }

  function closeDialog() {
    if (saving) return;
    setOpen(false);
    setEditing(null);
    setDraft(emptyDraft);
    setFormError(null);
    window.setTimeout(() => createButtonRef.current?.focus(), 50);
  }

  async function onSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving) return;
    setFormError(null);
    const name = normalizeStoredText(draft.name);
    const code = draft.code.trim();
    if (!name) {
      setFormError("Name is required.");
      return;
    }
    if (!code) {
      setFormError("Code is required.");
      return;
    }
    setSaving(true);
    try {
      const body = {
        name,
        code,
        location: draft.location.trim() || null,
        status: draft.status,
      };
      if (editing) {
        await updateWarehouse(editing.id, body);
        setSuccess("Warehouse updated.");
      } else {
        await createWarehouse(body);
        setSuccess("Warehouse created.");
      }
      setOpen(false);
      setEditing(null);
      setDraft(emptyDraft);
      await load();
    } catch (err) {
      setFormError(warehouseFormError(err));
    } finally {
      setSaving(false);
    }
  }

  async function onDeactivate() {
    if (!deactivateTarget) return;
    setSaving(true);
    try {
      await deactivateWarehouse(deactivateTarget.id);
      setSuccess("Warehouse deactivated. It will no longer appear on new documents.");
      setDeactivateTarget(null);
      await load();
    } catch (err) {
      setError(err);
      setDeactivateTarget(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <RequirePermission permissions={["warehouses.write"]}>
      <div className="bb-page">
        <PageHeader
          title="Warehouses"
          description="Create and deactivate store locations. Inactive warehouses stay on history but are hidden from new purchase orders and inventory out."
          actions={
            <Button ref={createButtonRef} onClick={openCreate}>
              <Plus className="size-4" />
              Create warehouse
            </Button>
          }
        />

        {success ? (
          <Alert>
            <AlertTitle>Success</AlertTitle>
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        ) : null}

        {loading ? <TableSkeleton /> : null}
        {error ? <PageError error={error} onRetry={() => void load()} /> : null}

        {!loading && !error && items.length === 0 ? (
          <EmptyState
            title="No warehouses yet"
            message="Create a warehouse so purchase orders and stock movements have a destination."
            action={
              <Button onClick={openCreate}>
                <Plus className="size-4" />
                Create warehouse
              </Button>
            }
          />
        ) : null}

        {!loading && !error && items.length > 0 ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <div className="relative max-w-sm flex-1">
                <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search name, code, location"
                  className="pl-9"
                  aria-label="Search warehouses"
                />
              </div>
              <select
                className="border-input bg-background h-9 rounded-md border px-3 text-sm"
                value={status}
                onChange={(e) =>
                  setStatus(e.target.value as "all" | "active" | "inactive")
                }
                aria-label="Filter by status"
              >
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            {filtered.length === 0 ? (
              <EmptyState
                title="No matches"
                message="Try a different search term or status."
              />
            ) : (
              <DataTable>
                <Table>
                  <THead>
                    <tr>
                      <Th>Name</Th>
                      <Th>Code</Th>
                      <Th>Location</Th>
                      <Th>Status</Th>
                      <Th className="text-right">Actions</Th>
                    </tr>
                  </THead>
                  <TBody>
                    {filtered.map((row) => (
                      <Tr key={row.id}>
                        <Td className="font-medium">{row.name}</Td>
                        <Td className="font-mono text-xs">{row.code}</Td>
                        <Td>{row.location?.trim() || "—"}</Td>
                        <Td>
                          <ActiveBadge active={row.status === "active"} />
                        </Td>
                        <Td className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEdit(row)}
                            >
                              Edit
                            </Button>
                            {row.status === "active" ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDeactivateTarget(row)}
                              >
                                Deactivate
                              </Button>
                            ) : null}
                          </div>
                        </Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              </DataTable>
            )}
          </div>
        ) : null}
      </div>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) closeDialog();
        }}
      >
        <DialogContent>
          <form onSubmit={(e) => void onSave(e)}>
            <DialogHeader>
              <DialogTitle>
                {editing ? "Edit warehouse" : "Create warehouse"}
              </DialogTitle>
              <DialogDescription>
                Code must be unique in this workspace.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              {formError ? <FormError>{formError}</FormError> : null}
              <div className="space-y-1.5">
                <Label htmlFor="warehouse-name">Name</Label>
                <Input
                  id="warehouse-name"
                  ref={nameRef}
                  value={draft.name}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, name: e.target.value }))
                  }
                  onBlur={(e) =>
                    setDraft((d) => ({
                      ...d,
                      name: normalizeStoredText(e.target.value),
                    }))
                  }
                  aria-invalid={formError === "Name is required."}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="warehouse-code">Code</Label>
                <Input
                  id="warehouse-code"
                  value={draft.code}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, code: e.target.value }))
                  }
                  aria-invalid={formError === "Code is required."}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="warehouse-location">Location</Label>
                <Input
                  id="warehouse-location"
                  value={draft.location}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, location: e.target.value }))
                  }
                />
              </div>
              {editing ? (
                <div className="space-y-1.5">
                  <Label htmlFor="warehouse-status">Status</Label>
                  <select
                    id="warehouse-status"
                    className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                    value={draft.status}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        status: e.target.value as "active" | "inactive",
                      }))
                    }
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              ) : null}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={closeDialog}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deactivateTarget)}
        onOpenChange={(next) => {
          if (!next && !saving) setDeactivateTarget(null);
        }}
        title="Deactivate warehouse?"
        description="It will disappear from new purchase orders and inventory out. Existing documents keep the warehouse name."
        confirmLabel="Deactivate"
        destructive
        loading={saving}
        onConfirm={() => void onDeactivate()}
      />
    </RequirePermission>
  );
}
