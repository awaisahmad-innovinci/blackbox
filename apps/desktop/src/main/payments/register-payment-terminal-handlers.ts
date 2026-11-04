import type {
  PaymentRequest,
  PaymentTerminalSettings,
} from "@blackbox/shared";
import type { IpcMain } from "electron";
import {
  connectPaymentTerminal,
  disconnectPaymentTerminal,
  loadPaymentTerminalSettings,
  paymentTerminalCancel,
  paymentTerminalInquiry,
  paymentTerminalPay,
  paymentTerminalIsLinkUp,
  paymentTerminalStatus,
  persistPaymentTerminalSettings,
} from "./payment-terminal-service";

export function registerPaymentTerminalHandlers(ipcMain: IpcMain): void {
  ipcMain.handle("paymentTerminal:getSettings", () =>
    loadPaymentTerminalSettings(),
  );

  ipcMain.handle(
    "paymentTerminal:saveSettings",
    (_event, settings: PaymentTerminalSettings) => {
      persistPaymentTerminalSettings(settings);
      return { ok: true as const };
    },
  );

  ipcMain.handle("paymentTerminal:connect", () => connectPaymentTerminal());

  ipcMain.handle("paymentTerminal:disconnect", async () => {
    await disconnectPaymentTerminal();
  });

  ipcMain.handle("paymentTerminal:status", () => paymentTerminalStatus());

  ipcMain.handle("paymentTerminal:isLinkUp", () => paymentTerminalIsLinkUp());

  ipcMain.handle("paymentTerminal:pay", (_event, request: PaymentRequest) =>
    paymentTerminalPay(request),
  );

  ipcMain.handle("paymentTerminal:inquiry", (_event, invoiceId: string) =>
    paymentTerminalInquiry(invoiceId),
  );

  ipcMain.handle("paymentTerminal:cancel", (_event, invoiceId: string) =>
    paymentTerminalCancel(invoiceId),
  );
}
