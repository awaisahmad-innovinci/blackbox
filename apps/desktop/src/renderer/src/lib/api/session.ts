const TOKEN_KEY = "blackbox.accessToken";
const REFRESH_KEY = "blackbox.refreshToken";

let onSessionCleared: (() => void) | null = null;

/** Registered by the session provider so a failed refresh can route to sign-in. */
export function setOnSessionCleared(handler: (() => void) | null): void {
  onSessionCleared = handler;
}

export function getAccessToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_KEY);
  } catch {
    return null;
  }
}

export function setAuthTokens(access: string, refresh: string): void {
  localStorage.setItem(TOKEN_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
}

export function clearAuthTokens(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
  } catch {
    /* storage unavailable */
  }
}

export function clearSessionAndNotify(): void {
  clearAuthTokens();
  onSessionCleared?.();
}
