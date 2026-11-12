import type {
  PosCardTerminalPushResult,
  PosCardTerminalSettings,
  PosSerialPortInfo,
} from "@blackbox/shared";
import {
  pushBankEdcAmount,
  testBankEdcSerialPort,
} from "./card-terminal/bank-edc-driver";
import { listSerialPorts } from "./card-terminal/serial-transport";
import {
  getPosCardTerminalSettingsLocal,
  savePosCardTerminalSettingsLocal,
} from "./pos-card-terminal-settings-local";

export function loadPosCardTerminalSettings(): PosCardTerminalSettings {
  return getPosCardTerminalSettingsLocal();
}

export function persistPosCardTerminalSettings(
  settings: PosCardTerminalSettings,
): void {
  savePosCardTerminalSettingsLocal(settings);
}

export async function listPosSerialPorts(): Promise<PosSerialPortInfo[]> {
  return listSerialPorts();
}

export async function pushCardTerminalAmount(
  amount: number,
): Promise<PosCardTerminalPushResult> {
  const settings = getPosCardTerminalSettingsLocal();
  if (!settings.enabled) {
    return {
      ok: false,
      message: "Card terminal integration is disabled.",
    };
  }
  if (!(amount > 0) || !Number.isFinite(amount)) {
    return { ok: false, message: "Amount must be greater than zero." };
  }

  const rounded = Math.round(amount * 10000) / 10000;
  return pushBankEdcAmount(rounded, settings);
}

export async function testCardTerminalConnection(
  settings?: PosCardTerminalSettings,
): Promise<PosCardTerminalPushResult> {
  const resolved = settings ?? getPosCardTerminalSettingsLocal();
  if (!resolved.enabled) {
    return {
      ok: false,
      message: "Enable card terminal integration before testing.",
    };
  }

  if (resolved.connection.type === "serial") {
    return testBankEdcSerialPort(resolved);
  }

  return pushBankEdcAmount(1, resolved);
}
