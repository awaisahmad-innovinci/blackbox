import type { PosPrinterInfo, PosPrinterSettings } from "@blackbox/shared";
import type { BrowserWindow } from "electron";
import { buildDrawerKickBuffer } from "./escpos-drawer";
import {
  getPosPrinterSettingsLocal,
  savePosPrinterSettingsLocal,
} from "./pos-settings-local";
import { sendRawToPrinter } from "./printer-raw";

export function loadPosPrinterSettings(): PosPrinterSettings {
  return getPosPrinterSettingsLocal();
}

export function persistPosPrinterSettings(settings: PosPrinterSettings): void {
  savePosPrinterSettingsLocal(settings);
}

export async function listOsPrinters(
  window: BrowserWindow,
): Promise<PosPrinterInfo[]> {
  const printers = await window.webContents.getPrintersAsync();
  return printers.map((printer) => ({
    name: printer.name,
    isDefault: Boolean(
      (printer.options as { isDefault?: boolean } | undefined)?.isDefault,
    ),
  }));
}

export async function openCashDrawer(): Promise<void> {
  const settings = getPosPrinterSettingsLocal();
  if (!settings.enabled) {
    throw new Error("Cash drawer integration is disabled in printer settings");
  }
  if (!settings.printerName.trim()) {
    throw new Error("Receipt printer is not configured");
  }

  const kick = buildDrawerKickBuffer(settings.drawerPin);
  await sendRawToPrinter(settings.printerName, kick);
}
