import type {
  PosCardTerminalSettings,
  PosPrinterSettings,
} from "@blackbox/shared";
import type { BrowserWindow, IpcMain } from "electron";
import {
  listPosSerialPorts,
  loadPosCardTerminalSettings,
  persistPosCardTerminalSettings,
  pushCardTerminalAmount,
  testCardTerminalConnection,
} from "./card-terminal-service";
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

  // Silent receipt print (opt-in setting). Prints the current page to the saved printer.
  ipcMain.handle("pos:printSilently", async () => {
    const window = getMainWindow();
    if (!window) return { ok: false as const, error: "No window" };
    const settings = loadPosPrinterSettings();
    return new Promise<{ ok: true } | { ok: false; error: string }>((resolve) => {
      window.webContents.print(
        {
          silent: true,
          printBackground: true,
          ...(settings.printerName ? { deviceName: settings.printerName } : {}),
        },
        (success, failureReason) =>
          resolve(success ? { ok: true } : { ok: false, error: failureReason || "Print failed" }),
      );
    });
  });

  ipcMain.handle("pos:openCashDrawer", async () => {
    await openCashDrawer();
    return { ok: true as const };
  });

  ipcMain.handle("pos:testDrawer", async () => {
    await openCashDrawer();
    return { ok: true as const };
  });

  ipcMain.handle("pos:getCardTerminalSettings", () =>
    loadPosCardTerminalSettings(),
  );

  ipcMain.handle(
    "pos:saveCardTerminalSettings",
    (_event, settings: PosCardTerminalSettings) => {
      persistPosCardTerminalSettings(settings);
      return { ok: true as const };
    },
  );

  ipcMain.handle("pos:listSerialPorts", async () => listPosSerialPorts());

  ipcMain.handle("pos:pushCardAmount", async (_event, amount: number) => {
    const settings = loadPosCardTerminalSettings();
    const mainWindow = getMainWindow();
    if (
      settings.enabled &&
      settings.connection.type === "hid-keys" &&
      mainWindow?.isFocused() === true
    ) {
      return {
        ok: false as const,
        deferred: true as const,
        message:
          "Card terminal amount is waiting until the POS window is not focused.",
      };
    }
    return pushCardTerminalAmount(amount);
  });

  ipcMain.handle(
    "pos:testCardTerminal",
    async (_event, settings?: PosCardTerminalSettings) =>
      testCardTerminalConnection(settings),
  );
}
