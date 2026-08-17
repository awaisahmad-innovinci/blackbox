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
import type { AuthUser, Permission, SignupTenantRequest } from "@blackbox/shared";
import { setOnSessionCleared, refreshAccessToken } from "@/lib/api-client";
import {
  loginRequest,
  logoutRequest,
  meRequest,
  signupTenantRequest,
} from "@/lib/auth-api";
import { getRefreshToken } from "@/lib/auth-storage";

type AuthStatus = "loading" | "authenticated" | "anonymous";

type AuthContextValue = {
  user: AuthUser | null;
  status: AuthStatus;
  login: (identifier: string, password: string) => Promise<AuthUser>;
  signup: (payload: SignupTenantRequest) => Promise<AuthUser>;
  logout: () => Promise<void>;
  hasPermission: (...keys: Permission[]) => boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

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

      const ok = await refreshAccessToken();
      if (!ok) {
        if (!cancelled) {
          becomeAnonymous();
        }
        return;
      }

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
  }, [becomeAnonymous]);

  const login = useCallback(async (identifier: string, password: string) => {
    const res = await loginRequest(identifier, password);
    setUser(res.user);
    setStatus("authenticated");
    return res.user;
  }, []);

  const signup = useCallback(async (payload: SignupTenantRequest) => {
    const res = await signupTenantRequest(payload);
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
      signup,
      logout,
      hasPermission,
    }),
    [user, status, login, signup, logout, hasPermission],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
