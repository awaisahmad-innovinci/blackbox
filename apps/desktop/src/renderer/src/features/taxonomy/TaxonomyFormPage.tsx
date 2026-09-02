import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { EntityStatus, SyncEntityType } from "@blackbox/shared";
import { Button } from "@blackbox/ui/button";
import { Input } from "@blackbox/ui/input";
import { Label } from "@blackbox/ui/label";
import { Textarea } from "@blackbox/ui/textarea";
import { getApiErrorMessage } from "@renderer/lib/api/client";
import { syncNow } from "@renderer/lib/sync/sync-status";
import { commitLocalChange, isDeviceBound } from "@renderer/lib/local-db/local-write";
import type { TaxonomyRow } from "./TaxonomyListPage";

export function TaxonomyFormPage({
  titleNew,
  titleEdit,
  basePath,
  entityLabel,
  loadOne,
  create,
  update,
  deactivate,
  syncEntityType,
}: {
  titleNew: string;
  titleEdit: string;
  basePath: string;
  entityLabel: string;
  loadOne: (id: string) => Promise<TaxonomyRow>;
  create: (body: {
    name: string;
    description?: string;
    status?: EntityStatus;
  }) => Promise<TaxonomyRow>;
  update: (
    id: string,
    body: { name: string; description?: string; status?: EntityStatus },
  ) => Promise<TaxonomyRow>;
  deactivate: (id: string) => Promise<TaxonomyRow>;
  syncEntityType?: Extract<
    SyncEntityType,
    "brand" | "category" | "vendor_group"
  >;
}) {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<EntityStatus>("active");
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    void loadOne(id)
      .then((row) => {
        if (cancelled) return;
        setName(row.name);
        setDescription(row.description ?? "");
        setStatus(row.status);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(getApiErrorMessage(err, `Failed to load ${entityLabel}`));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, loadOne, entityLabel]);

  async function onSave() {
    setError(null);
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: name.trim(),
        description: description.trim(),
        status,
      };
      if (syncEntityType && (await isDeviceBound())) {
        const rowId = isEdit && id ? id : crypto.randomUUID();
        await commitLocalChange({
          entityType: syncEntityType,
          entityId: rowId,
          operation: status === "inactive" ? "DELETE" : "UPSERT",
          payload: { id: rowId, ...body },
        });
        void syncNow();
        navigate(basePath);
        return;
      }
      if (isEdit && id) {
        await update(id, body);
      } else {
        await create(body);
      }
      navigate(basePath);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, `Failed to save ${entityLabel}`));
    } finally {
      setSaving(false);
    }
  }

  async function onDeactivate() {
    if (!id) return;
    setError(null);
    setSaving(true);
    try {
      if (syncEntityType && (await isDeviceBound())) {
        await commitLocalChange({
          entityType: syncEntityType,
          entityId: id,
          operation: "DELETE",
          payload: { id, name, description, status: "inactive" },
        });
        void syncNow();
        navigate(basePath);
        return;
      }
      await deactivate(id);
      navigate(basePath);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, `Failed to deactivate ${entityLabel}`));
    } finally {
      setSaving(false);
    }
  }

  async function onActivate() {
    if (!id) return;
    setError(null);
    setSaving(true);
    try {
      const body = {
        name: name.trim(),
        description: description.trim(),
        status: "active" as const,
      };
      if (syncEntityType && (await isDeviceBound())) {
        await commitLocalChange({
          entityType: syncEntityType,
          entityId: id,
          operation: "UPSERT",
          payload: { id, ...body },
        });
        void syncNow();
        navigate(basePath);
        return;
      }
      await update(id, body);
      navigate(basePath);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, `Failed to activate ${entityLabel}`));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-muted-foreground text-sm">Loading…</p>;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {isEdit ? titleEdit : titleNew}
          </h1>
          {isEdit ? (
            <p className="text-muted-foreground mt-1 text-sm capitalize">
              Status: {status}
            </p>
          ) : null}
        </div>
        <Button variant="ghost" onClick={() => navigate(basePath)}>
          Back
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

      <section className="grid max-w-xl gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">Name *</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
        </div>
        {isEdit ? (
          <div className="space-y-1.5">
            <Label htmlFor="status">Status</Label>
            <select
              id="status"
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              value={status}
              onChange={(e) => setStatus(e.target.value as EntityStatus)}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        ) : null}
      </section>

      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={saving} onClick={() => void onSave()}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => navigate(basePath)}
        >
          Cancel
        </Button>
        {isEdit && status === "active" ? (
          <Button
            type="button"
            variant="ghost"
            disabled={saving}
            onClick={() => void onDeactivate()}
          >
            Deactivate
          </Button>
        ) : null}
        {isEdit && status === "inactive" ? (
          <Button
            type="button"
            variant="ghost"
            disabled={saving}
            onClick={() => void onActivate()}
          >
            Activate
          </Button>
        ) : null}
      </div>
    </div>
  );
}
