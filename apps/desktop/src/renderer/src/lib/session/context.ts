import { createContext, useContext } from "react";
import type { AuthUser } from "@blackbox/shared";

export type SessionStatus = "loading" | "signed-out" | "signed-in";

/** `unbound` means this machine has no device row yet (never signed in). */
export type DeviceState =
  | "unknown"
  | "unbound"
  | "pending"
  | "trusted"
  | "revoked";

export type SessionValue = {
  status: SessionStatus;
  user: AuthUser | null;
  /** True when the session was restored from cache without reaching the API. */
  offline: boolean;
  deviceState: DeviceState;
  signIn: (identifier: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshDeviceState: () => Promise<void>;
};

export const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error("useSession must be used inside SessionProvider");
  }
  return value;
}
