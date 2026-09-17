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

  const secrets = getSupervisorTotpSecretsLocal();
  if (secrets.length === 0) {
    return {
      ok: false,
      error:
        "No supervisor Authy codes on this device. Go online and complete Authy setup for a Manager or Owner.",
    };
  }

  for (const row of secrets) {
    const totp = new TOTP({
      secret: Secret.fromBase32(row.secretBase32),
      algorithm: "SHA1",
      digits: 6,
      period: 30,
    });
    const delta = totp.validate({ token: trimmed, window: 1 });
    if (delta !== null) {
      recentFailures.length = 0;
      return {
        ok: true,
        userId: row.userId,
        displayName: row.displayName.trim() || "Manager",
      };
    }
  }

  recordFailure();
  return { ok: false, error: "Invalid Authy code" };
}
