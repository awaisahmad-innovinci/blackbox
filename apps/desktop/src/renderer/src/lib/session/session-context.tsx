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
  desktopLogin,
  desktopLogout,
  fetchCurrentDevice,
  restoreDesktopSession,
} from "@renderer/lib/api/auth";
import { setOnSessionCleared } from "@renderer/lib/api/session";
import { setDeviceRevoked } from "@renderer/lib/local-db/local-write";
import { startAutoSync, stopAutoSync } from "@renderer/lib/sync/auto-sync";
import { refreshPendingCount } from "@renderer/lib/sync/sync-status";
import {
  SessionContext,
  type DeviceState,
  type SessionStatus,
  type SessionValue,
} from "./context";

const CACHED_USER_KEY = "blackbox.user";
const DEVICE_POLL_MS = 60_000;

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
  const mounted = useRef(true);

  const applyDeviceState = useCallback((next: DeviceState) => {
    setDeviceRevoked(next === "revoked");
    if (mounted.current) setDeviceState(next);
  }, []);

  const refreshDeviceState = useCallback(async () => {
    const identity = await window.blackbox?.identity?.get();
    if (!identity) {
      applyDeviceState("unbound");
      return;
    }
    try {
      const device = await fetchCurrentDevice();
      applyDeviceState(
        device?.status === "trusted"
          ? "trusted"
          : device?.status === "revoked"
            ? "revoked"
            : device
              ? "pending"
              : "unbound",
      );
    } catch {
      applyDeviceState("unknown");
    }
  }, [applyDeviceState]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    setOnSessionCleared(() => {
      writeCachedUser(null);
      setUser(null);
      setStatus("signed-out");
      setDeviceState("unknown");
    });
    return () => setOnSessionCleared(null);
  }, []);

  useEffect(() => {
    void (async () => {
      const result = await restoreDesktopSession();
      if (!mounted.current) return;
      if (result.status === "signed-in") {
        writeCachedUser(result.user);
        setUser(result.user);
        setOffline(false);
        setStatus("signed-in");
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
    if (status !== "signed-in" || deviceState !== "trusted") {
      stopAutoSync();
      return;
    }
    startAutoSync();
    return () => stopAutoSync();
  }, [status, deviceState]);

  // A device is trusted from the web admin, so poll until that lands.
  useEffect(() => {
    if (status !== "signed-in") return;
    if (deviceState !== "pending" && deviceState !== "unknown") return;
    const timer = setInterval(() => {
      void refreshDeviceState();
    }, DEVICE_POLL_MS);
    return () => clearInterval(timer);
  }, [status, deviceState, refreshDeviceState]);

  const signIn = useCallback(
    async (identifier: string, password: string) => {
      const result = await desktopLogin(identifier, password);
      writeCachedUser(result.user);
      setUser(result.user);
      setOffline(false);
      setStatus("signed-in");
      await refreshDeviceState();
    },
    [refreshDeviceState],
  );

  const signOut = useCallback(async () => {
    await desktopLogout();
    writeCachedUser(null);
    setUser(null);
    setOffline(false);
    setDeviceState("unknown");
    setStatus("signed-out");
  }, []);

  const value = useMemo<SessionValue>(
    () => ({
      status,
      user,
      offline,
      deviceState,
      signIn,
      signOut,
      refreshDeviceState,
    }),
    [status, user, offline, deviceState, signIn, signOut, refreshDeviceState],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}
