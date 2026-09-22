import type { PosPrinterSettings } from "@blackbox/shared";
import type { BrowserWindow, IpcMain } from "electron";
import {
  listOsPrinters,
  loadPosPrinterSettings,
  openCashDrawer,
  persistPosPrinterSettings,
} from "./pos-service";

export function registerPosHandlers(
  ipcMain: IpcMain,
  getMainWindow: () => BrowserWindow | null,
): void {
  ipcMain.handle("pos:getPrinterSettings", () => loadPosPrinterSettings());

  ipcMain.handle(
    "pos:savePrinterSettings",
    (_event, settings: PosPrinterSettings) => {
      persistPosPrinterSettings(settings);
      return { ok: true as const };
    },
  );

  ipcMain.handle("pos:listPrinters", async () => {
    const window = getMainWindow();
    if (!window) return [];
    return listOsPrinters(window);
  });

  ipcMain.handle("pos:openCashDrawer", async () => {
    await openCashDrawer();
    return { ok: true as const };
  });

  ipcMain.handle("pos:testDrawer", async () => {
    await openCashDrawer();
    return { ok: true as const };
  });
}
