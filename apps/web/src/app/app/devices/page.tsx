"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@blackbox/ui/badge";
import { Button } from "@blackbox/ui/button";
import { RequirePermission } from "@/components/require-permission";
import { useAuth } from "@/components/auth-provider";
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
import { DeviceStatusBadge } from "@/components/status-badges";
import { FormError, FormSuccess } from "@/components/section-card";
import {
  deleteDevice,
  listDevices,
  restoreDevice,
  trustDevice,
  type DeviceDto,
} from "@/lib/admin-api";
import { toUserFacingError } from "@/lib/api-error";

export default function DevicesPage() {
  const { hasPermission } = useAuth();
  const [devices, setDevices] = useState<DeviceDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [trustTarget, setTrustTarget] = useState<DeviceDto | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeviceDto | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const canManage = hasPermission("devices.manage");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDevices(await listDevices(showDeleted ? "deleted" : "all"));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [showDeleted]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onTrustConfirm() {
    if (!trustTarget) return;
    const wasRevoked = trustTarget.status === "revoked";
    setBusy(true);
    setSuccess(null);
    setFormError(null);
    try {
      const updated = await trustDevice(trustTarget.id);
      setDevices((rows) =>
        rows.map((row) => (row.id === updated.id ? updated : row)),
      );
      setTrustTarget(null);
      setSuccess(
        wasRevoked
          ? `${updated.name} trusted again.`
          : `${updated.name} trusted.`,
      );
    } catch (err) {
      setFormError(toUserFacingError(err));
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteConfirm() {
    if (!deleteTarget) return;
    setBusy(true);
    setSuccess(null);
    setFormError(null);
    try {
      await deleteDevice(deleteTarget.id);
      setDevices((rows) => rows.filter((row) => row.id !== deleteTarget.id));
      setSuccess(`${deleteTarget.name} deleted.`);
      setDeleteTarget(null);
    } catch (err) {
      setDeleteTarget(null);
      setFormError(toUserFacingError(err));
    } finally {
      setBusy(false);
    }
  }

  async function onRestore(device: DeviceDto) {
    setBusy(true);
    setSuccess(null);
    setFormError(null);
    try {
      await restoreDevice(device.id);
      setDevices((rows) => rows.filter((row) => row.id !== device.id));
      setSuccess(`${device.name} restored. Trust it again before it can sync.`);
    } catch (err) {
      setFormError(toUserFacingError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <RequirePermission permissions={["devices.read"]}>
      <div className="bb-page">
        <PageHeader
          title="Devices"
          description="View, trust, and revoke registered desktop devices."
        />

        <FormSuccess>{success}</FormSuccess>
        <FormError>{formError}</FormError>

        <div className="flex flex-wrap gap-3">
          <select
            className="border-input bg-background h-9 rounded-md border px-3 text-sm"
            value={showDeleted ? "deleted" : "all"}
            onChange={(e) => setShowDeleted(e.target.value === "deleted")}
            aria-label="Filter devices"
          >
            <option value="all">All devices</option>
            <option value="deleted">Deleted</option>
          </select>
        </div>

        {loading ? <TableSkeleton /> : null}
        {error ? <PageError error={error} onRetry={() => void load()} /> : null}
        {!loading && !error && devices.length === 0 ? (
          <EmptyState
            title={showDeleted ? "No deleted devices" : "No devices yet"}
            message={
              showDeleted
                ? "Deleted devices appear here so you can restore them."
                : "When a desktop device is enrolled, it will appear here for review and revocation."
            }
          />
        ) : null}

        {!loading && !error && devices.length > 0 ? (
          <DataTable>
            <Table>
              <THead>
                <tr>
                  <Th>Name</Th>
                  <Th>Code</Th>
                  <Th>Status</Th>
                  <Th>Fingerprint</Th>
                  <Th>Trusted</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </THead>
              <TBody>
                {devices.map((d) => (
                  <Tr key={d.id}>
                    <Td className="font-medium">{d.name}</Td>
                    <Td className="font-mono text-xs">{d.code ?? "—"}</Td>
                    <Td>
                      {d.deletedAt ? (
                        <Badge variant="outline">Deleted</Badge>
                      ) : (
                        <DeviceStatusBadge status={d.status} />
                      )}
                    </Td>
                    <Td className="max-w-[14rem] truncate font-mono text-xs">
                      {d.fingerprint}
                    </Td>
                    <Td className="text-muted-foreground text-xs">
                      {d.trustedAt
                        ? new Date(d.trustedAt).toLocaleString()
                        : "—"}
                    </Td>
                    <Td className="text-right">
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        {canManage && d.deletedAt ? (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            onClick={() => void onRestore(d)}
                          >
                            Restore
                          </Button>
                        ) : null}
                        {canManage && !d.deletedAt && d.status === "pending" ? (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            onClick={() => setTrustTarget(d)}
                          >
                            Trust
                          </Button>
                        ) : null}
                        {canManage && !d.deletedAt && d.status === "revoked" ? (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            onClick={() => setTrustTarget(d)}
                          >
                            Trust again
                          </Button>
                        ) : null}
                        {canManage && !d.deletedAt ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            disabled={busy}
                            onClick={() => setDeleteTarget(d)}
                          >
                            Delete
                          </Button>
                        ) : null}
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/app/devices/${d.id}`}>View</Link>
                        </Button>
                      </div>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </DataTable>
        ) : null}
      </div>

      <ConfirmDialog
        open={trustTarget !== null}
        onOpenChange={(open) => {
          if (!open) setTrustTarget(null);
        }}
        title={
          trustTarget?.status === "revoked"
            ? "Trust this device again?"
            : "Trust this device?"
        }
        description={
          trustTarget?.status === "revoked"
            ? `${trustTarget.name} will be trusted again. The desktop downloads a fresh copy from the cloud.`
            : `${trustTarget?.name ?? "This device"} can push and pull sync once trusted.`
        }
        confirmLabel={
          trustTarget?.status === "revoked" ? "Trust again" : "Trust device"
        }
        loading={busy}
        onConfirm={onTrustConfirm}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setDeleteTarget(null);
        }}
        title="Delete this device?"
        description={`${deleteTarget?.name ?? "This device"} will be revoked, its local data erased, and hidden from this list. You can restore it from the Deleted filter, then trust it again.`}
        confirmLabel="Delete device"
        destructive
        loading={busy}
        onConfirm={onDeleteConfirm}
      />
    </RequirePermission>
  );
}
