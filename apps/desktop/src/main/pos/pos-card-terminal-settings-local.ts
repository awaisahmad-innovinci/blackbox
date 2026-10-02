import {
  DEFAULT_POS_CARD_TERMINAL_SETTINGS,
  type PosCardTerminalSettings,
} from "@blackbox/shared";
import { getSyncMeta, setSyncMeta } from "../db/sync-meta";

const SETTINGS_KEY = "pos.card_terminal_settings";

export function getPosCardTerminalSettingsLocal(): PosCardTerminalSettings {
  const raw = getSyncMeta(SETTINGS_KEY);
  if (!raw) return { ...DEFAULT_POS_CARD_TERMINAL_SETTINGS };

  try {
    const parsed = JSON.parse(raw) as Partial<PosCardTerminalSettings>;
    const connection = parsed.connection;
    const type =
      connection?.type === "serial" ? "serial" : ("hid-keys" as const);
    return {
      enabled: parsed.enabled === true,
      driverId: "bank-edc",
      connection: {
        type,
        portPath:
          typeof connection?.portPath === "string" ? connection.portPath : "",
        baudRate:
          typeof connection?.baudRate === "number" &&
          Number.isFinite(connection.baudRate)
            ? connection.baudRate
            : 9600,
      },
      amountScale: parsed.amountScale === "minor" ? "minor" : "major",
    };
  } catch {
    return { ...DEFAULT_POS_CARD_TERMINAL_SETTINGS };
  }
}

export function savePosCardTerminalSettingsLocal(
  settings: PosCardTerminalSettings,
): void {
  setSyncMeta(
    SETTINGS_KEY,
    JSON.stringify({
      enabled: settings.enabled,
      driverId: "bank-edc",
      connection: {
        type:
          settings.connection.type === "serial" ? "serial" : "hid-keys",
        portPath: settings.connection.portPath.trim(),
        baudRate:
          settings.connection.baudRate === 9600 ||
          settings.connection.baudRate === 115200 ||
          settings.connection.baudRate === 38400
            ? settings.connection.baudRate
            : 9600,
      },
      amountScale: settings.amountScale === "minor" ? "minor" : "major",
    }),
  );
}
