import type { AuthResponse, AuthUser, LoginRequest } from "@blackbox/shared";
import { apiFetch } from "./client";
import { clearAuthTokens, getRefreshToken, setAuthTokens } from "./session";

function parseJwt(token: string): { tenantId?: string; deviceId?: string } {
  const part = token.split(".")[1];
  if (!part) return {};
  try {
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as { tenantId?: string; deviceId?: string };
  } catch {
    return {};
  }
}

export type DesktopLoginResult = {
  user: AuthUser;
  tenantId: string;
  deviceId: string | null;
};

export async function desktopLogin(
  identifier: string,
  password: string,
): Promise<DesktopLoginResult> {
  const fingerprint = await window.blackbox?.identity?.getFingerprint();
  const payload: LoginRequest = {
    identifier,
    password,
    client: "desktop",
    fingerprint,
    deviceName: "Desktop",
  };
  const res = await apiFetch<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
    skipAuth: true,
  });
  setAuthTokens(res.tokens.accessToken, res.tokens.refreshToken);

  const claims = parseJwt(res.tokens.accessToken);
  const tenantId = claims.tenantId ?? res.user.tenantId;
  const deviceId = claims.deviceId ?? null;
  if (deviceId) {
    await window.blackbox?.identity?.bind({
      tenantId,
      deviceId,
      instanceId: crypto.randomUUID(),
    });
  }
  return { user: res.user, tenantId, deviceId };
}

export function fetchCurrentUser(): Promise<AuthUser> {
  return apiFetch<AuthUser>("/auth/me");
}

export type CurrentDevice = { id: string; name: string; status: string } | null;

export function fetchCurrentDevice(): Promise<CurrentDevice> {
  return apiFetch<CurrentDevice>("/devices/me");
}

export type RestoreResult =
  | { status: "signed-in"; user: AuthUser }
  | { status: "offline" }
  | { status: "signed-out" };

/**
 * Restores a session on app start. Keeps the stored tokens when the API is
 * unreachable so the app still opens offline with the local database.
 */
export async function restoreDesktopSession(): Promise<RestoreResult> {
  if (!getRefreshToken()) return { status: "signed-out" };
  try {
    return { status: "signed-in", user: await fetchCurrentUser() };
  } catch (error: unknown) {
    if (error instanceof TypeError) return { status: "offline" };
  }
  clearAuthTokens();
  return { status: "signed-out" };
}

/** Revokes the refresh token server-side, always clearing local tokens. */
export async function desktopLogout(): Promise<void> {
  const refreshToken = getRefreshToken();
  try {
    if (refreshToken) {
      await apiFetch<{ success: true }>("/auth/logout", {
        method: "POST",
        body: JSON.stringify({ refreshToken }),
        skipAuth: true,
      });
    }
  } catch {
    /* clear the local session even when revoke fails */
  } finally {
    clearAuthTokens();
  }
}
