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

function dir(): string {
  return app.getPath("userData");
}

export function getOrCreateFingerprint(): string {
  const path = join(dir(), "device-fingerprint");
  if (existsSync(path)) return readFileSync(path, "utf8").trim();
  const raw = `${hostname()}:${process.pid}:${Date.now()}:${randomUUID()}`;
  const fingerprint = createHash("sha256").update(raw).digest("hex").slice(0, 32);
  mkdirSync(dir(), { recursive: true });
  writeFileSync(path, fingerprint, "utf8");
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
