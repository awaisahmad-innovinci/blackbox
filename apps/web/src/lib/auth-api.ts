import type {
  AuthResponse,
  AuthUser,
  ForgotPasswordRequest,
  LoginRequest,
  MessageResponse,
  ResetPasswordRequest,
  SignupTenantRequest,
} from "@blackbox/shared";
import { apiFetch, apiJson, clearClientSession, setSessionFromAuthResponse } from "./api-client";
import { getRefreshToken } from "./auth-storage";

export async function loginRequest(
  identifier: string,
  password: string,
): Promise<AuthResponse> {
  const payload: LoginRequest = {
    identifier,
    password,
    client: "web",
  };
  const res = await apiJson<AuthResponse>("/auth/login", "POST", payload, {
    skipAuth: true,
  });
  setSessionFromAuthResponse(res.tokens);
  return res;
}

export async function signupTenantRequest(
  payload: SignupTenantRequest,
): Promise<AuthResponse> {
  const res = await apiJson<AuthResponse>("/auth/signup-tenant", "POST", payload, {
    skipAuth: true,
  });
  setSessionFromAuthResponse(res.tokens);
  return res;
}

export async function meRequest(): Promise<AuthUser> {
  return apiFetch<AuthUser>("/auth/me");
}

/**
 * Attempt revoke then always clear local session.
 */
export async function logoutRequest(): Promise<void> {
  const refreshToken = getRefreshToken();
  try {
    if (refreshToken) {
      await apiJson(
        "/auth/logout",
        "POST",
        { refreshToken },
        { skipAuth: true },
      );
    }
  } catch {
    // Always clear local session even if revoke fails.
  } finally {
    clearClientSession();
  }
}

export async function forgotPasswordRequest(
  payload: ForgotPasswordRequest,
): Promise<MessageResponse> {
  return apiJson<MessageResponse>(
    "/auth/forgot-password",
    "POST",
    payload,
    { skipAuth: true },
  );
}

export async function resetPasswordRequest(
  payload: ResetPasswordRequest,
): Promise<MessageResponse> {
  return apiJson<MessageResponse>(
    "/auth/reset-password",
    "POST",
    payload,
    { skipAuth: true },
  );
}
