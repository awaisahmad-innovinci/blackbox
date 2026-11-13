import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { AuthUser } from "@blackbox/shared";
import {
  acknowledgeLocalWipe,
  desktopLogin,
  desktopLogout,
  fetchCurrentDevice,
  restoreDesktopSession,
  type CurrentDevice,
} from "@renderer/lib/api/auth";
import { startForcedFullSync } from "@renderer/lib/sync/catalog-sync";
import {
  isDeviceRevokedMessage,
  setOnDeviceRevoked,
} from "./device-lock";
import { writeCachedDeviceCode } from "@renderer/lib/device-code";
import { getTillLogoutBlockMessage } from "@renderer/lib/local-db/till-source";
import { setOnSessionCleared } from "@renderer/lib/api/session";
import { setDeviceRevoked } from "@renderer/lib/local-db/local-write";
import { startAutoSync, stopAutoSync } from "@renderer/lib/sync/auto-sync";
import { refreshPendingCount } from "@renderer/lib/sync/sync-status";
import { refreshSupervisorTotpCache } from "@renderer/lib/api/totp";
import {
  registerSessionUserRefresh,
  refreshSessionUserFromApi,
} from "./session-user-refresh";
import {
  SessionContext,
  type DeviceState,
  type SessionStatus,
  type SessionValue,
} from "./context";

const CACHED_USER_KEY = "blackbox.user";
const DEVICE_POLL_MS = 15_000;

function readCachedUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(CACHED_USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

function writeCachedUser(user: AuthUser | null): void {
  try {
    if (user) localStorage.setItem(CACHED_USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(CACHED_USER_KEY);
  } catch {
    /* storage unavailable */
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [offline, setOffline] = useState(false);
  const [deviceState, setDeviceState] = useState<DeviceState>("unknown");
  const [deviceLocked, setDeviceLocked] = useState(false);
  const [deviceRestoring, setDeviceRestoring] = useState(false);
  const mounted = useRef(true);
  const offlineRef = useRef(false);
  const holdingRef = useRef(false);
  const wipedRef = useRef(false);
  const restoreRef = useRef<Promise<void> | null>(null);
  const deviceEpoch = useRef(0);
  const refreshInFlight = useRef(false);
  offlineRef.current = offline;

  const applyDeviceState = useCallback((next: DeviceState) => {
    setDeviceRevoked(next === "revoked" || holdingRef.current);
    if (mounted.current) setDeviceState(next);
  }, []);

  const wipeLocalData = useCallback(async () => {
    if (wipedRef.current) return;
    wipedRef.current = true;
    holdingRef.current = true;
    setDeviceLocked(true);
    setDeviceRevoked(true);
    stopAutoSync();
    await window.blackbox?.localDb?.wipe?.();
  }, []);

  const restoreAfterTrust = useCallback(async () => {
    if (restoreRef.current) return restoreRef.current;
    const run = (async () => {
      setDeviceRestoring(true);
      setDeviceLocked(true);
      try {
        await window.blackbox?.localDb?.reopen?.();
        await startForcedFullSync();
        await acknowledgeLocalWipe();
        wipedRef.current = false;
        holdingRef.current = false;
        setDeviceRevoked(false);
        setDeviceLocked(false);
        setDeviceRestoring(false);
        if (mounted.current) applyDeviceState("trusted");
      } catch (error: unknown) {
        setDeviceRestoring(false);
        if (mounted.current) applyDeviceState("trusted");
        throw error;
      }
    })();
    restoreRef.current = run.finally(() => {
      restoreRef.current = null;
    });
    return restoreRef.current;
  }, [applyDeviceState]);

  const applyRemoteDevice = useCallback(
    async (device: CurrentDevice) => {
      writeCachedDeviceCode(device?.code ?? null);
      const revoked = device?.status === "revoked";
      const mustWipe = revoked || device?.wipeLocalData === true;
      if (!device) {
        holdingRef.current = false;
        wipedRef.current = false;
        setDeviceLocked(false);
        setDeviceRestoring(false);
        applyDeviceState("unbound");
        return;
      }
      if (!mustWipe) {
        holdingRef.current = false;
        wipedRef.current = false;
        setDeviceLocked(false);
        setDeviceRestoring(false);
        applyDeviceState(device.status === "trusted" ? "trusted" : "pending");
        return;
      }
      await wipeLocalData();
      if (revoked) {
        if (mounted.current) applyDeviceState("revoked");
        return;
      }
      if (mounted.current) applyDeviceState("trusted");
      await restoreAfterTrust();
    },
    [applyDeviceState, restoreAfterTrust, wipeLocalData],
  );

  const refreshDeviceState = useCallback(async () => {
    const epoch = ++deviceEpoch.current;
    const identity = await window.blackbox?.identity?.get();
    if (epoch !== deviceEpoch.current) return;
    if (!identity) {
      holdingRef.current = false;
      setDeviceLocked(false);
      applyDeviceState("unbound");
      return;
    }
    try {
      const device = await fetchCurrentDevice();
      if (epoch !== deviceEpoch.current) return;
      await applyRemoteDevice(device);
    } catch (error: unknown) {
      if (epoch !== deviceEpoch.current) return;
      if (isDeviceRevokedMessage(error)) {
        await wipeLocalData();
        if (mounted.current) applyDeviceState("revoked");
        return;
      }
      if (!holdingRef.current && mounted.current) applyDeviceState("unknown");
    }
  }, [applyDeviceState, applyRemoteDevice, wipeLocalData]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const applySessionUser = useCallback((next: AuthUser) => {
    writeCachedUser(next);
    if (mounted.current) {
      setUser(next);
      setOffline(false);
    }
  }, []);

  useEffect(() => {
    registerSessionUserRefresh({
      applyUser: applySessionUser,
      isOffline: () => offlineRef.current,
    });
    return () => registerSessionUserRefresh(null);
  }, [applySessionUser]);

  useEffect(() => {
    setOnSessionCleared(() => {
      writeCachedUser(null);
      holdingRef.current = false;
      wipedRef.current = false;
      setDeviceLocked(false);
      setDeviceRestoring(false);
      setUser(null);
      setStatus("signed-out");
      setDeviceState("unknown");
    });
    return () => setOnSessionCleared(null);
  }, []);

  useEffect(() => {
    setOnDeviceRevoked(() => {
      if (refreshInFlight.current) return;
      refreshInFlight.current = true;
      void refreshDeviceState().finally(() => {
        refreshInFlight.current = false;
      });
    });
    return () => setOnDeviceRevoked(null);
  }, [refreshDeviceState]);

  useEffect(() => {
    void (async () => {
      const result = await restoreDesktopSession();
      if (!mounted.current) return;
      if (result.status === "signed-in") {
        writeCachedUser(result.user);
        setUser(result.user);
        setOffline(false);
        setStatus("signed-in");
        void refreshSupervisorTotpCache();
      } else if (result.status === "offline") {
        setUser(readCachedUser());
        setOffline(true);
        setStatus("signed-in");
      } else {
        writeCachedUser(null);
        setUser(null);
        setStatus("signed-out");
      }
      await refreshDeviceState();
      await refreshPendingCount().catch(() => undefined);
    })();
  }, [refreshDeviceState]);

  useEffect(() => {
    if (status !== "signed-in" || deviceState !== "trusted" || deviceLocked) {
      stopAutoSync();
      return;
    }
    startAutoSync();
    return () => stopAutoSync();
  }, [status, deviceState, deviceLocked]);

  // Trust and revoke happen in the web admin, so keep checking while signed in.
  useEffect(() => {
    if (status !== "signed-in" || offline) return;
    const timer = setInterval(() => {
      void refreshDeviceState();
    }, DEVICE_POLL_MS);
    const onFocus = () => {
      void refreshDeviceState();
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onFocus);
    };
  }, [status, offline, refreshDeviceState]);

  const signIn = useCallback(
    async (identifier: string, password: string) => {
      const result = await desktopLogin(identifier, password);
      writeCachedUser(result.user);
      setUser(result.user);
      setOffline(false);
      window.location.hash = "#/";
      setStatus("signed-in");
      await refreshDeviceState();
      void refreshSupervisorTotpCache();
    },
    [refreshDeviceState],
  );

  const refreshSessionUser = useCallback(async () => {
    await refreshSessionUserFromApi();
  }, []);

  const signOut = useCallback(async () => {
    if (user && !holdingRef.current) {
      const block = await getTillLogoutBlockMessage({
        userId: user.id,
        permissions: user.permissions ?? [],
      }).catch(() => null);
      if (block) throw new Error(block);
    }
    await desktopLogout();
    writeCachedDeviceCode(null);
    writeCachedUser(null);
    holdingRef.current = false;
    wipedRef.current = false;
    setDeviceLocked(false);
    setDeviceRestoring(false);
    setUser(null);
    setOffline(false);
    setDeviceState("unknown");
    setStatus("signed-out");
  }, [user]);

  const value = useMemo<SessionValue>(
    () => ({
      status,
      user,
      offline,
      deviceState,
      deviceLocked,
      deviceRestoring,
      signIn,
      signOut,
      refreshDeviceState,
      refreshSessionUser,
    }),
    [
      status,
      user,
      offline,
      deviceState,
      deviceLocked,
      deviceRestoring,
      signIn,
      signOut,
      refreshDeviceState,
      refreshSessionUser,
    ],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}
