export const DEVICE_STATUSES = ["pending", "trusted", "revoked"] as const;

export type DeviceStatus = (typeof DEVICE_STATUSES)[number];

export interface Device {
  id: string;
  tenantId: string;
  fingerprint: string;
  name: string;
  status: DeviceStatus;
  trustedAt: string | null;
  revokedAt: string | null;
}

export interface DeviceUser {
  deviceId: string;
  userId: string;
  offlineEnabled: boolean;
  /** ISO timestamp; Phase 1 default renews to now + 7 days on online auth. */
  offlineExpiresAt: string | null;
  lastOnlineAt: string | null;
}

export interface RegisterDeviceRequest {
  fingerprint: string;
  name: string;
}

/** Env / config key default for offline authorization TTL (days). */
export const OFFLINE_AUTHORIZATION_DAYS_DEFAULT = 7;

/** Access token TTL in seconds (15 minutes). */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

/** Refresh token TTL in seconds (7 days). */
export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
