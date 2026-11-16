export type TotpStatusResponse = {
  enrolled: boolean;
  confirmedAt: string | null;
};

export type TotpEnrollStartResponse = {
  otpauthUrl: string;
  qrDataUrl: string;
};

export type TotpSupervisorCacheEntry = {
  userId: string;
  secret: string;
  fullName: string;
  /** True when the user holds the MANAGER role (used to gate till open/close). */
  isManager: boolean;
};

export type TotpSupervisorCacheResponse = {
  entries: TotpSupervisorCacheEntry[];
};

export type TotpVerifySupervisorCodeResult =
  | { ok: true; userId: string; displayName: string }
  | { ok: false; error: string };
