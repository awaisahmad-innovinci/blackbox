import { getApiBaseUrl } from "./api-base";
import { ApiError, friendlyMessage } from "./api-error";
import {
  applyAuthTokens,
  clearSessionTokens,
  getAccessToken,
  getRefreshToken,
  setAccessToken,
} from "./auth-storage";

type ApiFetchOptions = RequestInit & {
  /** Skip Authorization header and 401 refresh (login/signup/refresh). */
  skipAuth?: boolean;
  /** Internal: do not refresh again on this attempt. */
  _isRetry?: boolean;
};

type JsonBody = object | unknown[] | null;

let onSessionCleared: (() => void) | null = null;

export function setOnSessionCleared(handler: (() => void) | null): void {
  onSessionCleared = handler;
}

function notifySessionCleared(): void {
  onSessionCleared?.();
}

async function parseJsonSafe(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function messageFromBody(status: number, body: unknown): string {
  if (
    body &&
    typeof body === "object" &&
    "message" in body &&
    typeof (body as { message: unknown }).message === "string"
  ) {
    const msg = (body as { message: string }).message;
    // Nest validation may return arrays; keep short and non-sensitive.
    if (msg.length > 0 && msg.length < 200 && !msg.includes("token")) {
      return friendlyMessage(status, msg);
    }
  }
  if (
    body &&
    typeof body === "object" &&
    "message" in body &&
    Array.isArray((body as { message: unknown }).message)
  ) {
    return friendlyMessage(status, "Please check the form fields and try again.");
  }
  return friendlyMessage(status);
}

/**
 * Single-flight refresh: concurrent 401s share one refresh call.
 * On success, atomically replaces bb_refresh with the rotated token.
 */
export type RefreshOutcome = "ok" | "invalid" | "offline";

let refreshInFlightOutcome: Promise<RefreshOutcome> | null = null;

export async function refreshAccessToken(): Promise<RefreshOutcome> {
  if (refreshInFlightOutcome) {
    return refreshInFlightOutcome;
  }

  refreshInFlightOutcome = (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) {
      clearSessionTokens();
      return "invalid";
    }

    try {
      const res = await fetch(`${getApiBaseUrl()}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ refreshToken }),
      });

      const body = await parseJsonSafe(res);
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          clearSessionTokens();
          return "invalid";
        }
        return "offline";
      }

      const tokens = (body as { tokens?: { accessToken?: string; refreshToken?: string } })
        ?.tokens;
      if (!tokens?.accessToken || !tokens.refreshToken) {
        clearSessionTokens();
        return "invalid";
      }

      applyAuthTokens({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      });
      return "ok";
    } catch {
      return "offline";
    } finally {
      refreshInFlightOutcome = null;
    }
  })();

  return refreshInFlightOutcome;
}

export async function apiFetch<T = unknown>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<T> {
  const { skipAuth = false, _isRetry = false, headers, ...init } = options;
  const url = `${getApiBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;

  const reqHeaders = new Headers(headers);
  if (!reqHeaders.has("Accept")) {
    reqHeaders.set("Accept", "application/json");
  }
  if (init.body && !reqHeaders.has("Content-Type")) {
    reqHeaders.set("Content-Type", "application/json");
  }

  if (!skipAuth) {
    const access = getAccessToken();
    if (access) {
      reqHeaders.set("Authorization", `Bearer ${access}`);
    }
  }

  let res: Response;
  try {
    res = await fetch(url, { ...init, headers: reqHeaders });
  } catch (error) {
    throw error instanceof TypeError
      ? error
      : new TypeError("Network request failed");
  }

  if (res.status === 401 && !skipAuth && !_isRetry) {
    const refreshed = await refreshAccessToken();
    if (refreshed === "ok") {
      return apiFetch<T>(path, { ...options, _isRetry: true });
    }
    if (refreshed === "invalid") {
      clearSessionTokens();
      notifySessionCleared();
      throw new ApiError(401, friendlyMessage(401));
    }
    throw new TypeError("Unable to reach Blackbox. Check your connection and try again.");
  }

  const body = await parseJsonSafe(res);

  if (!res.ok) {
    throw new ApiError(res.status, messageFromBody(res.status, body));
  }

  return body as T;
}

export async function apiJson<T>(
  path: string,
  method: string,
  body?: JsonBody,
  options?: Omit<ApiFetchOptions, "method" | "body">,
): Promise<T> {
  return apiFetch<T>(path, {
    ...options,
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Used after login/signup when tokens are already known. */
export function setSessionFromAuthResponse(tokens: {
  accessToken: string;
  refreshToken: string;
}): void {
  applyAuthTokens(tokens);
}

export function clearClientSession(): void {
  setAccessToken(null);
  clearSessionTokens();
}
