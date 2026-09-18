import { app } from "electron";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";

export type DeviceIdentity = {
  tenantId: string;
  deviceId: string;
  instanceId: string;
};

const FILE = "device-identity.json";
const FINGERPRINT_FILE = "device-fingerprint";

function dir(): string {
  return app.getPath("userData");
}

function fingerprintHash(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 32);
}

function readOsMachineId(): string | null {
  if (process.platform === "linux") {
    for (const path of ["/etc/machine-id", "/var/lib/dbus/machine-id"]) {
      if (!existsSync(path)) continue;
      const value = readFileSync(path, "utf8").trim();
      if (value) return value;
    }
  }
  return null;
}

/** Stable fingerprint from the OS machine id; null when unavailable. */
export function getStableMachineFingerprint(): string | null {
  const machineId = readOsMachineId();
  if (!machineId) return null;
  return fingerprintHash(`blackbox:${machineId}`);
}

export function persistFingerprint(fingerprint: string): void {
  mkdirSync(dir(), { recursive: true });
  writeFileSync(join(dir(), FINGERPRINT_FILE), fingerprint, "utf8");
}

export function getOrCreateFingerprint(): string {
  const path = join(dir(), FINGERPRINT_FILE);
  if (existsSync(path)) {
    const stored = readFileSync(path, "utf8").trim();
    if (stored) return stored;
  }

  const stable = getStableMachineFingerprint();
  const fingerprint =
    stable ??
    fingerprintHash(`${hostname()}:${process.pid}:${Date.now()}:${randomUUID()}`);
  persistFingerprint(fingerprint);
  return fingerprint;
}

export function readIdentity(): DeviceIdentity | null {
  const path = join(dir(), FILE);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as DeviceIdentity;
  } catch {
    return null;
  }
}

export function writeIdentity(identity: DeviceIdentity): void {
  mkdirSync(dir(), { recursive: true });
  writeFileSync(join(dir(), FILE), JSON.stringify(identity, null, 2), "utf8");
}

export function clearIdentity(): void {
  const path = join(dir(), FILE);
  if (existsSync(path)) writeFileSync(path, "{}", "utf8");
}

export function sqlitePathFor(identity: DeviceIdentity | null): string {
  const root = app.getPath("userData");
  if (!identity) return join(root, "blackbox-local.sqlite");
  const folder = join(root, "tenants", identity.tenantId, "devices");
  mkdirSync(folder, { recursive: true });
  return join(folder, `${identity.deviceId}.sqlite`);
}
