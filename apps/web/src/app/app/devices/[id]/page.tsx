"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
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
  getDevice,
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
    setBusy(true);
    setSuccess(null);
    setFormError(null);
    try {
      const updated = await trustDevice(device.id);
      setDevice(updated);
      setTrustConfirmOpen(false);
      setSuccess("Device trusted. Desktop sync is now allowed.");
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
            device ? <DeviceStatusBadge status={device.status} /> : null
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

            {hasPermission("devices.manage") && device.status === "pending" ? (
              <SectionCard
                title="Trust device"
                description="Allow this desktop to push and pull incremental sync."
              >
                <Button
                  disabled={busy}
                  onClick={() => setTrustConfirmOpen(true)}
                >
                  Trust device
                </Button>
              </SectionCard>
            ) : null}

            {hasPermission("devices.manage") && device.status !== "revoked" ? (
              <SectionCard
                title="Danger zone"
                description="Revoking a device immediately ends its trusted access."
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
          </>
        ) : null}
      </div>

      <ConfirmDialog
        open={trustConfirmOpen}
        onOpenChange={setTrustConfirmOpen}
        title="Trust this device?"
        description="The desktop can push and pull sync for this tenant once trusted."
        confirmLabel="Trust device"
        loading={busy}
        onConfirm={onTrust}
      />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Revoke device?"
        description="This device will lose trusted access and must be re-enrolled from the desktop app."
        confirmLabel="Revoke device"
        destructive
        loading={busy}
        onConfirm={onRevoke}
      />
    </RequirePermission>
  );
}
