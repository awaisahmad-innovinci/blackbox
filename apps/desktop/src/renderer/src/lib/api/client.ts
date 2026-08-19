import {
  clearSessionAndNotify,
  getAccessToken,
  getRefreshToken,
  setAuthTokens,
} from "./session";

const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(
  /\/$/,
  "",
);

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function getApiErrorMessage(
  error: unknown,
  fallback: string,
): string {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return "Your session expired. Sign in again to continue.";
    }
    if (error.status === 403) return error.message;
    if (error.status === 409) return error.message;
    if (error.status >= 400 && error.status < 500) {
      return `Please check the form: ${error.message}`;
    }
    return `The server could not complete the request. ${error.message}`;
  }
  if (error instanceof TypeError) {
    return "Cannot reach the Blackbox API. Check that the API is running and try again.";
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

type ApiFetchOptions = RequestInit & {
  /** Skip the Authorization header and 401 refresh (login / refresh calls). */
  skipAuth?: boolean;
  /** Internal: prevents a refresh loop on the retried request. */
  isRetry?: boolean;
};

let refreshInFlight: Promise<boolean> | null = null;

/**
 * Single-flight refresh so concurrent 401s trigger one rotation.
 * The API rotates the refresh token, so parallel calls would revoke each other.
 */
export async function refreshAccessToken(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken || !API_URL) return false;
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return false;
      const body = (await res.json()) as {
        tokens?: { accessToken?: string; refreshToken?: string };
      };
      if (!body.tokens?.accessToken || !body.tokens.refreshToken) return false;
      setAuthTokens(body.tokens.accessToken, body.tokens.refreshToken);
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

export async function apiFetch<T>(
  path: string,
  init?: ApiFetchOptions,
): Promise<T> {
  if (!API_URL) {
    throw new Error("VITE_API_URL is not configured");
  }

  const { skipAuth, isRetry, ...rest } = init ?? {};
  const token = skipAuth ? null : getAccessToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: {
      Accept: "application/json",
      ...(init?.body && !(init.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });

  if (res.status === 401 && !skipAuth && !isRetry && getRefreshToken()) {
    if (await refreshAccessToken()) {
      return apiFetch<T>(path, { ...init, isRetry: true });
    }
    clearSessionAndNotify();
    throw new ApiError("Session expired", 401);
  }

  if (!res.ok) {
    let message = res.statusText || `HTTP ${res.status}`;
    let details: unknown;
    try {
      const body = (await res.json()) as {
        message?: string | string[];
        errors?: unknown;
      };
      if (typeof body.message === "string") message = body.message;
      else if (Array.isArray(body.message)) message = body.message.join(", ");
      details = body.errors;
    } catch {
      /* ignore */
    }
    if (res.status === 401 && !skipAuth) {
      clearSessionAndNotify();
    }
    throw new ApiError(message, res.status, details);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}
