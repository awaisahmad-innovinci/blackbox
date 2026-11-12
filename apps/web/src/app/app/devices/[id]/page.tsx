"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@blackbox/ui/badge";
import { Button } from "@blackbox/ui/button";
import { RequirePermission } from "@/components/require-permission";
import { useAuth } from "@/components/auth-provider";
import { PageHeader } from "@/components/page-header";
import { LoadingState, PageError } from "@/components/page-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DeviceStatusBadge } from "@/components/status-badges";
import {
  FormError,
  FormSuccess,
  SectionCard,
} from "@/components/section-card";
import {
  deleteDevice,
  getDevice,
  restoreDevice,
  revokeDevice,
  trustDevice,
  type DeviceDto,
} from "@/lib/admin-api";
import { toUserFacingError } from "@/lib/api-error";

export default function DeviceDetailPage() {
  const params = useParams<{ id: string }>();
  const { hasPermission } = useAuth();
  const [device, setDevice] = useState<DeviceDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [trustConfirmOpen, setTrustConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDevice(await getDevice(params.id));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onTrust() {
    if (!device) return;
    const wasRevoked = device.status === "revoked";
    setBusy(true);
    setSuccess(null);
    setFormError(null);
    try {
      const updated = await trustDevice(device.id);
      setDevice(updated);
      setTrustConfirmOpen(false);
      setSuccess(
        wasRevoked
          ? "Device trusted again. The desktop can sync after the user signs in."
          : "Device trusted. Desktop sync is now allowed.",
      );
    } catch (err) {
      setFormError(toUserFacingError(err));
    } finally {
      setBusy(false);
    }
  }

  async function onRevoke() {
    if (!device) return;
    setBusy(true);
    setSuccess(null);
    setFormError(null);
    try {
      const updated = await revokeDevice(device.id);
      setDevice(updated);
      setConfirmOpen(false);
      setSuccess("Device revoked.");
    } catch (err) {
      setFormError(toUserFacingError(err));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!device) return;
    setBusy(true);
    setSuccess(null);
    setFormError(null);
    try {
      const updated = await deleteDevice(device.id);
      setDevice(updated);
      setDeleteConfirmOpen(false);
      setSuccess("Device deleted. Find it under the Deleted filter to restore.");
    } catch (err) {
      setDeleteConfirmOpen(false);
      setFormError(toUserFacingError(err));
    } finally {
      setBusy(false);
    }
  }

  async function onRestore() {
    if (!device) return;
    setBusy(true);
    setSuccess(null);
    setFormError(null);
    try {
      const updated = await restoreDevice(device.id);
      setDevice(updated);
      setSuccess("Device restored. Trust it again before it can sync.");
    } catch (err) {
      setFormError(toUserFacingError(err));
    } finally {
      setBusy(false);
    }
  }

  const canManage = hasPermission("devices.manage");

  return (
    <RequirePermission permissions={["devices.read"]}>
      <div className="bb-page-narrow">
        <PageHeader
          breadcrumb={
            <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
              <Link href="/app/devices">
                <ArrowLeft className="size-3.5" />
                Devices
              </Link>
            </Button>
          }
          title={device?.name ?? "Device"}
          actions={
            device ? (
              device.deletedAt ? (
                <Badge variant="outline">Deleted</Badge>
              ) : (
                <DeviceStatusBadge status={device.status} />
              )
            ) : null
          }
        />

        {loading ? <LoadingState /> : null}
        {error ? <PageError error={error} onRetry={() => void load()} /> : null}

        {device && !loading ? (
          <>
            <FormSuccess>{success}</FormSuccess>
            <FormError>{formError}</FormError>

            <SectionCard title="Device details">
              <dl className="space-y-4 text-sm">
                <div>
                  <dt className="text-muted-foreground text-xs tracking-wide uppercase">
                    Fingerprint
                  </dt>
                  <dd className="mt-1 break-all font-mono text-xs">
                    {device.fingerprint}
                  </dd>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground text-xs tracking-wide uppercase">
                      Register code
                    </dt>
                    <dd className="mt-1 font-mono">{device.code ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs tracking-wide uppercase">
                      Trusted
                    </dt>
                    <dd className="mt-1">
                      {device.trustedAt
                        ? new Date(device.trustedAt).toLocaleString()
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs tracking-wide uppercase">
                      Revoked
                    </dt>
                    <dd className="mt-1">
                      {device.revokedAt
                        ? new Date(device.revokedAt).toLocaleString()
                        : "—"}
                    </dd>
                  </div>
                </div>
              </dl>
            </SectionCard>

            {canManage && device.deletedAt ? (
              <SectionCard
                title="Restore device"
                description="Bring this device back to the list. It stays revoked until you trust it again."
              >
                <Button disabled={busy} onClick={() => void onRestore()}>
                  Restore device
                </Button>
              </SectionCard>
            ) : null}

            {canManage &&
            !device.deletedAt &&
            (device.status === "pending" || device.status === "revoked") ? (
              <SectionCard
                title={
                  device.status === "revoked" ? "Trust again" : "Trust device"
                }
                description={
                  device.status === "revoked"
                    ? "Restore trusted access so this desktop can sync again after the user signs in."
                    : "Allow this desktop to push and pull incremental sync."
                }
              >
                <Button
                  disabled={busy}
                  onClick={() => setTrustConfirmOpen(true)}
                >
                  {device.status === "revoked" ? "Trust again" : "Trust device"}
                </Button>
              </SectionCard>
            ) : null}

            {canManage && !device.deletedAt && device.status !== "revoked" ? (
              <SectionCard
                title="Danger zone"
                description="Revoking locks the desktop to a blank dashboard and erases its local data."
              >
                <Button
                  variant="destructive"
                  disabled={busy}
                  onClick={() => setConfirmOpen(true)}
                >
                  Revoke device
                </Button>
              </SectionCard>
            ) : null}

            {canManage && !device.deletedAt ? (
              <SectionCard
                title="Delete device"
                description="Deleting revokes the device, erases its local data, and hides it from the devices list."
              >
                <Button
                  variant="destructive"
                  disabled={busy}
                  onClick={() => setDeleteConfirmOpen(true)}
                >
                  Delete device
                </Button>
              </SectionCard>
            ) : null}
          </>
        ) : null}
      </div>

      <ConfirmDialog
        open={trustConfirmOpen}
        onOpenChange={setTrustConfirmOpen}
        title={
          device?.status === "revoked"
            ? "Trust this device again?"
            : "Trust this device?"
        }
        description={
          device?.status === "revoked"
            ? "The desktop downloads a fresh copy from the cloud. Changes that were only on that device are discarded."
            : "The desktop can push and pull sync for this tenant once trusted."
        }
        confirmLabel={
          device?.status === "revoked" ? "Trust again" : "Trust device"
        }
        loading={busy}
        onConfirm={onTrust}
      />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Revoke device?"
        description="The desktop is locked to a blank dashboard and its local data is erased, including anything that has not synced. Trusting it again downloads a fresh copy from the cloud."
        confirmLabel="Revoke device"
        destructive
        loading={busy}
        onConfirm={onRevoke}
      />

      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Delete device?"
        description="This device will be revoked, its local data erased, and it will be hidden from the devices list. You can restore it from the Deleted filter, then trust it again."
        confirmLabel="Delete device"
        destructive
        loading={busy}
        onConfirm={onDelete}
      />
    </RequirePermission>
  );
}
