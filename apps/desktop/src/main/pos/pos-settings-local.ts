import {
  DEFAULT_POS_PRINTER_SETTINGS,
  type PosPrinterSettings,
} from "@blackbox/shared";
import { getSyncMeta, setSyncMeta } from "../db/sync-meta";

const SETTINGS_KEY = "pos.printer_settings";

export function getPosPrinterSettingsLocal(): PosPrinterSettings {
  const raw = getSyncMeta(SETTINGS_KEY);
  if (!raw) return { ...DEFAULT_POS_PRINTER_SETTINGS };

  try {
    const parsed = JSON.parse(raw) as Partial<PosPrinterSettings>;
    return {
      enabled: parsed.enabled === true,
      printerName: typeof parsed.printerName === "string" ? parsed.printerName : "",
      drawerPin: parsed.drawerPin === 5 ? 5 : 2,
      openDrawerOnReceiptPrint: parsed.openDrawerOnReceiptPrint !== false,
    };
  } catch {
    return { ...DEFAULT_POS_PRINTER_SETTINGS };
  }
}

export function savePosPrinterSettingsLocal(settings: PosPrinterSettings): void {
  setSyncMeta(
    SETTINGS_KEY,
    JSON.stringify({
      enabled: settings.enabled,
      printerName: settings.printerName.trim(),
      drawerPin: settings.drawerPin === 5 ? 5 : 2,
      openDrawerOnReceiptPrint: settings.openDrawerOnReceiptPrint,
    }),
  );
}
