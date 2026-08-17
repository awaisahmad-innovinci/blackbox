"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@blackbox/ui/button";
import { RequirePermission } from "@/components/require-permission";
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
import { listDevices, type DeviceDto } from "@/lib/admin-api";

export default function DevicesPage() {
  const [devices, setDevices] = useState<DeviceDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

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

  return (
    <RequirePermission permissions={["devices.read"]}>
      <div className="bb-page">
        <PageHeader
          title="Devices"
          description="View and revoke registered devices. Enrollment happens from the desktop app."
        />

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
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/app/devices/${d.id}`}>View</Link>
                      </Button>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </DataTable>
        ) : null}
      </div>
    </RequirePermission>
  );
}
