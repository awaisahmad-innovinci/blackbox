import type {
  TotpEnrollStartResponse,
  TotpStatusResponse,
  TotpSupervisorCacheResponse,
} from "@blackbox/shared";
import { apiFetch, apiJson } from "./api-client";

export const totpApi = {
  status() {
    return apiFetch<TotpStatusResponse>("/auth/totp/status");
  },
  enrollStart() {
    return apiJson<TotpEnrollStartResponse>("/auth/totp/enroll/start", "POST");
  },
  enrollConfirm(code: string) {
    return apiJson<TotpStatusResponse>("/auth/totp/enroll/confirm", "POST", {
      code,
    });
  },
  resetSelf() {
    return apiJson<{ ok: true }>("/auth/totp", "DELETE");
  },
  resetUser(userId: string) {
    return apiJson<{ ok: true }>(`/auth/totp/users/${userId}`, "DELETE");
  },
  supervisorCache() {
    return apiFetch<TotpSupervisorCacheResponse>("/auth/totp/supervisor-cache");
  },
};

export function userHasSupervisorRole(
  roleIds: string[],
  roles: Array<{ id: string; key: string }>,
): boolean {
  const keys = new Set(
    roles.filter((role) => roleIds.includes(role.id)).map((role) => role.key),
  );
  return keys.has("OWNER") || keys.has("MANAGER");
}
