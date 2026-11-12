import type {
  PlatformLoginResponse,
  PlatformTenantSummary,
  ResetPlatformOwnerPasswordRequest,
  ResetPlatformOwnerPasswordResponse,
  SignupTenantRequest,
} from "@blackbox/shared";

const TOKEN_KEY = "bb_platform_access";

export function getPlatformToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setPlatformToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearPlatformToken(): void {
  sessionStorage.removeItem(TOKEN_KEY);
}

export class PlatformApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "PlatformApiError";
    this.status = status;
  }
}

function apiBase(): string {
  return (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(
    /\/$/,
    "",
  );
}

async function platformFetch<T>(
  path: string,
  method: "GET" | "POST" | "PATCH",
  body?: unknown,
  token?: string | null,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBase()}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new PlatformApiError(0, "Unable to reach Blackbox. Check your connection and try again.");
  }

  if (!response.ok) {
    let message = "Request failed. Please try again.";
    try {
      const data = (await response.json()) as { message?: string | string[] };
      if (Array.isArray(data.message)) {
        message = data.message.join(" ");
      } else if (typeof data.message === "string" && data.message.trim()) {
        message = data.message;
      }
    } catch {
      /* keep fallback */
    }
    throw new PlatformApiError(response.status, message);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export function loginPlatform(
  username: string,
  password: string,
): Promise<PlatformLoginResponse> {
  return platformFetch<PlatformLoginResponse>("/platform/login", "POST", {
    username,
    password,
  });
}

export function listTenants(token: string): Promise<PlatformTenantSummary[]> {
  return platformFetch<PlatformTenantSummary[]>(
    "/platform/tenants",
    "GET",
    undefined,
    token,
  );
}

export function createTenant(
  token: string,
  payload: SignupTenantRequest,
): Promise<PlatformTenantSummary> {
  return platformFetch<PlatformTenantSummary>(
    "/platform/tenants",
    "POST",
    payload,
    token,
  );
}

export function resetOwnerPassword(
  token: string,
  id: string,
  payload: ResetPlatformOwnerPasswordRequest,
): Promise<ResetPlatformOwnerPasswordResponse> {
  return platformFetch<ResetPlatformOwnerPasswordResponse>(
    `/platform/tenants/${id}/owner-password`,
    "POST",
    payload,
    token,
  );
}

export function setTenantActive(
  token: string,
  id: string,
  isActive: boolean,
): Promise<PlatformTenantSummary> {
  return platformFetch<PlatformTenantSummary>(
    `/platform/tenants/${id}`,
    "PATCH",
    { isActive },
    token,
  );
}
