import type { Permission } from "./permissions";

/** Application client — behavior only, not an authorization mechanism. */
export type AuthClient = "web" | "desktop";

export interface AuthUser {
  id: string;
  tenantId: string;
  /** Store / business display name (tenant.name). */
  tenantName?: string;
  /** Formatted business address from onboarding location (receipt header). */
  businessAddress?: string;
  email: string;
  username: string;
  fullName: string;
  /** Effective permission keys resolved from User → Role → Permission. */
  permissions: Permission[];
  /** When true, POS requires manager Authy before removing a sale line. */
  requireManagerApprovalRemoveSaleLine?: boolean;
  /** When true, POS requires manager Authy before opening a cashier till. */
  requireManagerApprovalTillOpen?: boolean;
  /** When true, POS requires manager Authy before collecting cash from a till. */
  requireManagerApprovalTillWithdraw?: boolean;
  /** Tenant default GST percentage applied to every sale (e.g. 17 = 17%). */
  defaultGstRate?: number;
  /** Tenant default sales tax percentage applied to every sale. */
  defaultSalesTaxRate?: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  /** Access token lifetime in seconds (Phase 1: 900 = 15 minutes). */
  expiresIn: number;
}

export interface AuthResponse {
  user: AuthUser;
  tokens: AuthTokens;
}

export interface SignupTenantRequest {
  businessName: string;
  fullName: string;
  email: string;
  username: string;
  password: string;
}

/**
 * Login accepts either email or username in `identifier`.
 */
export interface LoginRequest {
  identifier: string;
  password: string;
  client: AuthClient;
  /** Desktop machine fingerprint; bound to JWT deviceId when provided. */
  fingerprint?: string;
  /** When migrating from a legacy random fingerprint, the stable OS machine id hash. */
  stableFingerprint?: string;
  deviceName?: string;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface LogoutRequest {
  refreshToken: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  email: string;
  code: string;
  newPassword: string;
}

export interface MessageResponse {
  message: string;
}

/**
 * Minimal JWT access payload claims.
 * `iat` / `exp` are set by the JWT library via expiresIn.
 * Permissions are loaded server-side — not embedded as the authZ source of truth.
 */
export interface JwtPayload {
  /** User id */
  sub: string;
  tenantId: string;
  /** Present on desktop sessions bound to a registered device. */
  deviceId?: string;
}

/** Desktop login when the user already has an active session on a different device. */
export const SESSION_ALREADY_ACTIVE_ON_OTHER_DEVICE_MESSAGE =
  "This account is already signed in on another device. Sign out there first, then try again.";
