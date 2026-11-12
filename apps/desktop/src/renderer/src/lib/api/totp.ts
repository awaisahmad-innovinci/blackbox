import type {
  TotpEnrollStartResponse,
  TotpStatusResponse,
  TotpSupervisorCacheResponse,
} from "@blackbox/shared";
import { apiFetch } from "./client";

export const totpApi = {
  status() {
    return apiFetch<TotpStatusResponse>("/auth/totp/status");
  },
  enrollStart() {
    return apiFetch<TotpEnrollStartResponse>("/auth/totp/enroll/start", {
      method: "POST",
    });
  },
  enrollConfirm(code: string) {
    return apiFetch<TotpStatusResponse>("/auth/totp/enroll/confirm", {
      method: "POST",
      body: JSON.stringify({ code }),
    });
  },
  resetSelf() {
    return apiFetch<{ ok: true }>("/auth/totp", { method: "DELETE" });
  },
  resetUser(userId: string) {
    return apiFetch<{ ok: true }>(`/auth/totp/users/${userId}`, {
      method: "DELETE",
    });
  },
  supervisorCache() {
    return apiFetch<TotpSupervisorCacheResponse>("/auth/totp/supervisor-cache");
  },
};

export async function refreshSupervisorTotpCache(): Promise<void> {
  if (!window.blackbox?.totp) return;
  try {
    const { entries } = await totpApi.supervisorCache();
    await window.blackbox.totp.replaceSupervisorCache(
      entries.map((entry) => ({
        userId: entry.userId,
        secretBase32: entry.secret,
        displayName: entry.fullName,
      })),
    );
  } catch {
    /* offline or device not trusted — keep existing cache */
  }
}

export function canEnrollTotp(user: { permissions: readonly string[] }): boolean {
  return user.permissions.includes("sales.void");
}
