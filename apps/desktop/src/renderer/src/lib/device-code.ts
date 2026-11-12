import { fetchCurrentDevice } from "@renderer/lib/api/auth";

const DEVICE_CODE_KEY = "blackbox.deviceCode";

export function readCachedDeviceCode(): string | null {
  try {
    const cached = localStorage.getItem(DEVICE_CODE_KEY);
    return cached?.trim() ? cached.trim() : null;
  } catch {
    return null;
  }
}

export function writeCachedDeviceCode(code: string | null): void {
  try {
    if (code?.trim()) localStorage.setItem(DEVICE_CODE_KEY, code.trim());
    else localStorage.removeItem(DEVICE_CODE_KEY);
  } catch {
    /* storage unavailable */
  }
}

export async function resolveDeviceCode(): Promise<string> {
  const cached = readCachedDeviceCode();
  if (cached) return cached;

  try {
    const device = await fetchCurrentDevice();
    if (device?.code?.trim()) {
      writeCachedDeviceCode(device.code.trim());
      return device.code.trim();
    }
  } catch {
    /* offline — fall through */
  }

  throw new Error(
    "Register code unavailable. Go online once so this device receives a code (C1, C2, …).",
  );
}
