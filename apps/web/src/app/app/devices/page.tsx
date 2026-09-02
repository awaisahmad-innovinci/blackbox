"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
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
import { listDevices, trustDevice, type DeviceDto } from "@/lib/admin-api";
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
  const canManage = hasPermission("devices.manage");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDevices(await listDevices());
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

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

  return (
    <RequirePermission permissions={["devices.read"]}>
      <div className="bb-page">
        <PageHeader
          title="Devices"
          description="View, trust, and revoke registered desktop devices."
        />

        <FormSuccess>{success}</FormSuccess>
        <FormError>{formError}</FormError>

        {loading ? <TableSkeleton /> : null}
        {error ? <PageError error={error} onRetry={() => void load()} /> : null}
        {!loading && !error && devices.length === 0 ? (
          <EmptyState
            title="No devices yet"
            message="When a desktop device is enrolled, it will appear here for review and revocation."
          />
        ) : null}

        {!loading && !error && devices.length > 0 ? (
          <DataTable>
            <Table>
              <THead>
                <tr>
                  <Th>Name</Th>
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
                    <Td>
                      <DeviceStatusBadge status={d.status} />
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
                        {canManage && d.status === "pending" ? (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            onClick={() => setTrustTarget(d)}
                          >
                            Trust
                          </Button>
                        ) : null}
                        {canManage && d.status === "revoked" ? (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            onClick={() => setTrustTarget(d)}
                          >
                            Trust again
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
            ? `${trustTarget.name} will be trusted again. Sync resumes after the desktop user signs in.`
            : `${trustTarget?.name ?? "This device"} can push and pull sync once trusted.`
        }
        confirmLabel={
          trustTarget?.status === "revoked" ? "Trust again" : "Trust device"
        }
        loading={busy}
        onConfirm={onTrustConfirm}
      />
    </RequirePermission>
  );
}
