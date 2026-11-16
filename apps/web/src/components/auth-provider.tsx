"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { AuthUser, Permission } from "@blackbox/shared";
import { Button } from "@blackbox/ui/button";
import { setOnSessionCleared, refreshAccessTokenDetailed } from "@/lib/api-client";
import { loginRequest, logoutRequest, meRequest } from "@/lib/auth-api";
import { getRefreshToken } from "@/lib/auth-storage";

type AuthStatus = "loading" | "authenticated" | "anonymous";

type AuthContextValue = {
  user: AuthUser | null;
  status: AuthStatus;
  login: (identifier: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  hasPermission: (...keys: Permission[]) => boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  // Server/network down while restoring the session: show a retry screen, keep the session.
  const [bootUnavailable, setBootUnavailable] = useState(false);
  const [bootAttempt, setBootAttempt] = useState(0);

  const becomeAnonymous = useCallback(() => {
    setUser(null);
    setStatus("anonymous");
  }, []);

  useEffect(() => {
    setOnSessionCleared(becomeAnonymous);
    return () => setOnSessionCleared(null);
  }, [becomeAnonymous]);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      // A stored refresh token alone is NOT authenticated until refresh + me succeed.
      const refresh = getRefreshToken();
      if (!refresh) {
        if (!cancelled) {
          becomeAnonymous();
        }
        return;
      }

      const refreshed = await refreshAccessTokenDetailed();
      if (refreshed === "unavailable") {
        if (!cancelled) setBootUnavailable(true);
        return;
      }
      if (refreshed !== "ok") {
        if (!cancelled) {
          becomeAnonymous();
        }
        return;
      }
      if (!cancelled) setBootUnavailable(false);

      try {
        const me = await meRequest();
        if (!cancelled) {
          setUser(me);
          setStatus("authenticated");
        }
      } catch {
        if (!cancelled) {
          becomeAnonymous();
        }
      }
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, [becomeAnonymous, bootAttempt]);

  const login = useCallback(async (identifier: string, password: string) => {
    const res = await loginRequest(identifier, password);
    setUser(res.user);
    setStatus("authenticated");
    return res.user;
  }, []);

  const logout = useCallback(async () => {
    await logoutRequest();
    becomeAnonymous();
  }, [becomeAnonymous]);

  const hasPermission = useCallback(
    (...keys: Permission[]) => {
      if (!user) {
        return false;
      }
      return keys.every((k) => user.permissions.includes(k));
    },
    [user],
  );

  const value = useMemo(
    () => ({
      user,
      status,
      login,
      logout,
      hasPermission,
    }),
    [user, status, login, logout, hasPermission],
  );

  if (bootUnavailable) {
    return (
      <div className="bg-background flex min-h-screen items-center justify-center p-6">
        <div className="flex max-w-sm flex-col items-center gap-3 text-center text-sm">
          <p className="text-base font-medium">Blackbox cannot be reached</p>
          <p className="text-muted-foreground">
            You are still signed in. Check your internet connection, then try again.
          </p>
          <Button
            onClick={() => {
              setBootUnavailable(false);
              setBootAttempt((n) => n + 1);
            }}
          >
            Try again
          </Button>
        </div>
      </div>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
