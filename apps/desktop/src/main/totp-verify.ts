import { Secret, TOTP } from "otpauth";
import { getSupervisorTotpSecretsLocal } from "./db/supervisor-totp-local";

const MAX_FAILURES = 5;
const WINDOW_MS = 60_000;
const recentFailures: number[] = [];

function rateLimited(): boolean {
  const cutoff = Date.now() - WINDOW_MS;
  while (recentFailures.length > 0 && recentFailures[0]! < cutoff) {
    recentFailures.shift();
  }
  return recentFailures.length >= MAX_FAILURES;
}

function recordFailure(): void {
  recentFailures.push(Date.now());
}

export function verifySupervisorTotpCode(
  code: string,
  options?: { managerOnly?: boolean },
): { ok: true; userId: string; displayName: string } | { ok: false; error: string } {
  const trimmed = code.trim();
  if (!/^\d{6}$/.test(trimmed)) {
    return { ok: false, error: "Enter a 6-digit code" };
  }

  if (rateLimited()) {
    return {
      ok: false,
      error: "Too many attempts. Wait a moment and try again.",
    };
  }

  const allSecrets = getSupervisorTotpSecretsLocal();
  // Till open/close may only be authorised by a Manager — never an Owner.
  const secrets = options?.managerOnly
    ? allSecrets.filter((row) => row.isManager)
    : allSecrets;
  if (secrets.length === 0) {
    return {
      ok: false,
      error: options?.managerOnly
        ? "No Manager authentication codes on this device. Only a Manager's code can open or close a till — ask a Manager to set up their authenticator while online."
        : "No supervisor authentication codes on this device. Go online and complete authentication code setup for a Manager or Owner.",
    };
  }

  const managerOnly = options?.managerOnly === true;
  let matchedOwner = false;
  let matchedUnknownRole = false;

  for (const row of secrets) {
    const totp = new TOTP({
      secret: Secret.fromBase32(row.secretBase32),
      algorithm: "SHA1",
      digits: 6,
      period: 30,
    });
    const delta = totp.validate({ token: trimmed, window: 1 });
    if (delta === null) continue;

    if (managerOnly && row.roleKey !== "MANAGER") {
      if (row.roleKey === "OWNER") matchedOwner = true;
      else matchedUnknownRole = true;
      continue;
    }

    recentFailures.length = 0;
    return {
      ok: true,
      userId: row.userId,
      displayName: row.displayName.trim() || "Manager",
    };
  }

  if (managerOnly && matchedOwner) {
    recordFailure();
    return { ok: false, error: "A manager authentication code is required." };
  }

  if (managerOnly && matchedUnknownRole) {
    recordFailure();
    return {
      ok: false,
      error:
        "Connect so manager authentication codes can refresh, then try again.",
    };
  }

  recordFailure();
  return { ok: false, error: "Invalid authentication code" };
}
