import type { AuthUser } from "@blackbox/shared";
import { ApiError } from "@renderer/lib/api/client";
import { fetchCurrentUser } from "@renderer/lib/api/auth";
import { getRefreshToken } from "@renderer/lib/api/session";

type SessionUserRefreshHandlers = {
  applyUser: (user: AuthUser) => void;
  isOffline: () => boolean;
};

let handlers: SessionUserRefreshHandlers | null = null;

export function registerSessionUserRefresh(
  next: SessionUserRefreshHandlers | null,
): void {
  handlers = next;
}

/** Apply user from POST /auth/refresh without another round trip. */
export function applySessionUserFromRefresh(user: AuthUser): void {
  handlers?.applyUser(user);
}

/**
 * Reload permissions and tenant POS flags from GET /auth/me.
 * Skips when offline-restored or not signed in.
 */
export async function refreshSessionUserFromApi(): Promise<void> {
  if (!handlers || handlers.isOffline()) return;
  if (!getRefreshToken()) return;
  try {
    const user = await fetchCurrentUser();
    handlers.applyUser(user);
  } catch (error: unknown) {
    if (error instanceof ApiError && error.status === 401) {
      return;
    }
    if (error instanceof TypeError) {
      return;
    }
  }
}
