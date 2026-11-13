let handler: (() => void) | null = null;

/** The session provider registers this so a revoked-device response locks the app. */
export function setOnDeviceRevoked(next: (() => void) | null): void {
  handler = next;
}

export function notifyDeviceRevoked(): void {
  handler?.();
}

export function isDeviceRevokedMessage(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /device revoked/i.test(message);
}
