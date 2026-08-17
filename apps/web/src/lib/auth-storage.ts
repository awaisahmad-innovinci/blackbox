/**
 * Phase 1 token storage trade-off:
 * - Access token: memory only (never localStorage).
 * - Refresh token: localStorage key `bb_refresh` so sessions survive reload.
 * localStorage is readable by JS (XSS risk). No BFF/httpOnly cookies in Phase 1.
 */

const REFRESH_KEY = "bb_refresh";

let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return localStorage.getItem(REFRESH_KEY);
  } catch {
    return null;
  }
}

/** Atomically replace the stored refresh token (rotation). */
export function setRefreshToken(token: string): void {
  if (typeof window === "undefined") {
    return;
  }
  localStorage.setItem(REFRESH_KEY, token);
}

export function clearRefreshToken(): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    localStorage.removeItem(REFRESH_KEY);
  } catch {
    // ignore
  }
}

export function clearSessionTokens(): void {
  accessToken = null;
  clearRefreshToken();
}

export function applyAuthTokens(tokens: {
  accessToken: string;
  refreshToken: string;
}): void {
  setAccessToken(tokens.accessToken);
  setRefreshToken(tokens.refreshToken);
}
