import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { EntityStatus } from "@blackbox/shared";
import { normalizeStoredText } from "@blackbox/shared";
import { Button } from "@blackbox/ui/button";
import { Input } from "@blackbox/ui/input";
import { Label } from "@blackbox/ui/label";
import { getApiErrorMessage } from "@renderer/lib/api/client";
import { warehousesApi } from "@renderer/lib/api/warehouses";
import {
  commitLocalChange,
  isDeviceBound,
} from "@renderer/lib/local-db/local-write";
import { loadWarehouse } from "@renderer/lib/local-db/entity-source";
import { useSession } from "@renderer/lib/session/context";
import { syncNow } from "@renderer/lib/sync/sync-status";
import {
  FormEnterNav,
  formSelectPickerProps,
} from "@renderer/components/form-enter-nav";

export function WarehouseFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { user } = useSession();
  const canWrite = Boolean(user?.permissions.includes("warehouses.write"));

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [location, setLocation] = useState("");
  const [status, setStatus] = useState<EntityStatus>("active");
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    void loadWarehouse(id)
      .then((row) => {
        if (cancelled) return;
        setName(row.name);
        setCode(row.code);
        setLocation(row.location ?? "");
        setStatus(row.status);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(getApiErrorMessage(err, "Failed to load warehouse"));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function onSave() {
    if (!canWrite) return;
    setError(null);
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (!code.trim()) {
      setError("Code is required");
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: normalizeStoredText(name),
        code: code.trim(),
        location: location.trim() || null,
        status,
      };
      if (canWrite && (await isDeviceBound())) {
        const rowId = isEdit && id ? id : crypto.randomUUID();
        await commitLocalChange({
          entityType: "warehouse",
          entityId: rowId,
          operation: status === "inactive" ? "DELETE" : "UPSERT",
          payload: { id: rowId, ...body },
        });
        void syncNow();
        navigate("/warehouses");
        return;
      }
      const saved =
        isEdit && id
          ? await warehousesApi.update(id, body)
          : await warehousesApi.create(body);
      try {
        await window.blackbox?.localDb?.upsertWarehouses?.([saved]);
      } catch {
        /* optional cache */
      }
      navigate("/warehouses");
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Failed to save warehouse"));
    } finally {
      setSaving(false);
    }
  }

  async function onDeactivate() {
    if (!id || !canWrite) return;
    setError(null);
    setSaving(true);
    try {
      if (await isDeviceBound()) {
        await commitLocalChange({
          entityType: "warehouse",
          entityId: id,
          operation: "DELETE",
          payload: {
            id,
            name: normalizeStoredText(name),
            code,
            location: location.trim() || null,
            status: "inactive",
          },
        });
        void syncNow();
        navigate("/warehouses");
        return;
      }
      const saved = await warehousesApi.deactivate(id);
      try {
        await window.blackbox?.localDb?.upsertWarehouses?.([saved]);
      } catch {
        /* optional cache */
      }
      navigate("/warehouses");
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Failed to deactivate warehouse"));
    } finally {
      setSaving(false);
    }
  }

  async function onActivate() {
    if (!id || !canWrite) return;
    setError(null);
    setSaving(true);
    try {
      const body = {
        name: normalizeStoredText(name),
        code: code.trim(),
        location: location.trim() || null,
        status: "active" as const,
      };
      if (await isDeviceBound()) {
        await commitLocalChange({
          entityType: "warehouse",
          entityId: id,
          operation: "UPSERT",
          payload: { id, ...body },
        });
        void syncNow();
        navigate("/warehouses");
        return;
      }
      const saved = await warehousesApi.update(id, body);
      try {
        await window.blackbox?.localDb?.upsertWarehouses?.([saved]);
      } catch {
        /* optional cache */
      }
      navigate("/warehouses");
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Failed to activate warehouse"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-muted-foreground text-sm">Loading…</p>;
  }

  if (!canWrite && !isEdit) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">
          Create Warehouse
        </h1>
        <p className="text-muted-foreground text-sm">
          You do not have permission to create warehouses.
        </p>
        <Button variant="ghost" onClick={() => navigate("/warehouses")}>
          Back
        </Button>
      </div>
    );
  }

  const readOnly = !canWrite;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {isEdit ? "Edit Warehouse" : "Create Warehouse"}
          </h1>
          {isEdit ? (
            <p className="text-muted-foreground mt-1 text-sm capitalize">
              Status: {status}
            </p>
          ) : null}
        </div>
        <Button variant="ghost" onClick={() => navigate("/warehouses")}>
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

      <FormEnterNav className="grid max-w-xl gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">Name *</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={(e) => setName(normalizeStoredText(e.target.value))}
            autoFocus
            disabled={readOnly}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="code">Code *</Label>
          <Input
            id="code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            disabled={readOnly}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="location">Location</Label>
          <Input
            id="location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            disabled={readOnly}
          />
        </div>
        {isEdit ? (
          <div className="space-y-1.5">
            <Label htmlFor="status">Status</Label>
            <select
              id="status"
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              {...formSelectPickerProps()}
              value={status}
              onChange={(e) => setStatus(e.target.value as EntityStatus)}
              disabled={readOnly}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        ) : null}
      </FormEnterNav>

      <div className="flex flex-wrap gap-2">
        {canWrite ? (
          <Button type="button" disabled={saving} onClick={() => void onSave()}>
            {saving ? "Saving…" : "Save"}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          onClick={() => navigate("/warehouses")}
        >
          {canWrite ? "Cancel" : "Back"}
        </Button>
        {canWrite && isEdit && status === "active" ? (
          <Button
            type="button"
            variant="ghost"
            disabled={saving}
            onClick={() => void onDeactivate()}
          >
            Deactivate
          </Button>
        ) : null}
        {canWrite && isEdit && status === "inactive" ? (
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
