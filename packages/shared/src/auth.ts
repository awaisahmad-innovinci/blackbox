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
  /** Store contact phone from first location (receipt header). */
  businessPhone?: string;
  email: string;
  username: string;
  fullName: string;
  /** Effective permission keys resolved from User → Role → Permission. */
  permissions: Permission[];
  /** When true, POS requires a manager authentication code before removing a sale line. */
  requireManagerApprovalRemoveSaleLine?: boolean;
  /** When true, POS requires a manager authentication code before opening a cashier till. */
  requireManagerApprovalTillOpen?: boolean;
  /** When true, POS requires a manager authentication code before collecting or withdrawing till cash. */
  requireManagerApprovalTillWithdraw?: boolean;
  /** When true, POS requires a manager authentication code before posting a sale that includes FOC. */
  requireManagerApprovalFoc?: boolean;
  /** Tenant default GST percentage applied to every sale (e.g. 17 = 17%). */
  defaultGstRate?: number;
  /** Tenant default sales tax percentage applied to every sale. */
  defaultSalesTaxRate?: number;
  /** When true, posted sales are sent to FBR and the bill includes the FBR line. */
  fbrEnabled?: boolean;
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

export interface PlatformLoginRequest {
  username: string;
  password: string;
}

export interface PlatformLoginResponse {
  accessToken: string;
  expiresIn: number;
}

export interface PlatformTenantOwner {
  fullName: string;
  email: string;
  username: string;
}

export interface PlatformTenantSummary {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  owner: PlatformTenantOwner | null;
}

export interface UpdatePlatformTenantRequest {
  isActive: boolean;
}

export interface ResetPlatformOwnerPasswordRequest {
  password: string;
}

export interface ResetPlatformOwnerPasswordResponse {
  password: string;
  businessName: string;
  fullName: string;
  email: string;
  username: string;
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
