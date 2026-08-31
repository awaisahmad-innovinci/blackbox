import { useEffect, useState } from "react";
import { Button } from "@blackbox/ui/button";
import { ConfirmDialog } from "@renderer/components/confirm-dialog";
import { useSession, type DeviceState } from "@renderer/lib/session/context";
import { syncNow, useSyncStatus } from "@renderer/lib/sync/sync-status";

const DEVICE_COPY: Record<DeviceState, string> = {
  unknown:
    "Could not reach the API to check this device. Local work continues and syncs when back online.",
  unbound:
    "This machine is not registered yet. Sign out and sign in again to register it as a device.",
  pending:
    "Waiting for an owner to trust this device in the web app (Devices → Trust device). Changes stay queued locally until then.",
  trusted: "This device is trusted and syncs incrementally with the cloud.",
  revoked:
    "This device was revoked. Ask an owner to trust it again before syncing.",
};

export function DeviceSessionCard() {
  const { user, offline, deviceState, refreshDeviceState, signOut } =
    useSession();
  const sync = useSyncStatus();
  const [checking, setChecking] = useState(false);
  const [identity, setIdentity] = useState<string | null>(null);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    void window.blackbox?.identity?.get().then((row) => {
      setIdentity(row ? `${row.deviceId.slice(0, 8)}…` : null);
    });
  }, [deviceState]);

  if (!window.blackbox?.identity) return null;

  async function onCheck() {
    setChecking(true);
    try {
      await refreshDeviceState();
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="border-border rounded-lg border px-4 py-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">
            Signed in as {user?.fullName ?? user?.username ?? "unknown user"}
            {offline ? " (offline)" : ""}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            {DEVICE_COPY[deviceState]}
            {identity ? ` Device ${identity}` : ""}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            {sync.pending > 0
              ? `${sync.pending} change${sync.pending === 1 ? "" : "s"} queued locally`
              : "No changes queued"}
            {sync.lastSyncedAt
              ? ` · Last synced ${new Date(sync.lastSyncedAt).toLocaleTimeString()}`
              : ""}
            {sync.lastError ? ` · ${sync.lastError}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={checking}
            onClick={() => void onCheck()}
          >
            {checking ? "Checking…" : "Check device"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={sync.syncing}
            onClick={() => void syncNow()}
          >
            {sync.syncing ? "Syncing…" : "Push queued"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setLogoutOpen(true)}
          >
            Sign out
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={logoutOpen}
        onOpenChange={setLogoutOpen}
        title="Are you sure you want to logout?"
        description="Are you sure you want to logout?"
        confirmLabel="Yes"
        cancelLabel="Cancel"
        loading={loggingOut}
        onConfirm={async () => {
          setLoggingOut(true);
          try {
            await signOut();
          } finally {
            setLoggingOut(false);
            setLogoutOpen(false);
          }
        }}
      />
    </div>
  );
}
