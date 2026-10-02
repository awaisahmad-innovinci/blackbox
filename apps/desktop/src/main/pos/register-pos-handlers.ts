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

  ipcMain.handle("pos:pushCardAmount", async (_event, amount: number) =>
    pushCardTerminalAmount(amount),
  );

  ipcMain.handle(
    "pos:testCardTerminal",
    async (_event, settings?: PosCardTerminalSettings) =>
      testCardTerminalConnection(settings),
  );
}
