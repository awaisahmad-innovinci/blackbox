import type {
  PaymentRequest,
  PaymentResult,
  PaymentTerminalConnectResult,
  PaymentTerminalSettings,
} from "@blackbox/shared";
import { agentDebugLog } from "./agent-debug-log";
import { wrongEdcPortMessage } from "../pos/card-terminal/serial-port-edc";
import { formatSerialPortOpenError } from "../pos/card-terminal/serial-port-error";
import { PaymentTerminalManager } from "./PaymentTerminalManager";
import { getPosCardTerminalSettingsLocal } from "../pos/pos-card-terminal-settings-local";
import {
  getPaymentTerminalSettingsLocal,
  savePaymentTerminalSettingsLocal,
} from "./payment-terminal-settings-local";

function settingsForConnect(): PaymentTerminalSettings {
  const settings = getPaymentTerminalSettingsLocal();
  if (settings.transport !== "serial" || settings.serialPort.trim()) {
    return settings;
  }
  const card = getPosCardTerminalSettingsLocal();
  const portPath = card.connection.portPath.trim();
  if (!portPath) return settings;
  return {
    ...settings,
    serialPort: portPath,
    baudRate: card.connection.baudRate,
  };
}

const manager = new PaymentTerminalManager();

export function loadPaymentTerminalSettings(): PaymentTerminalSettings {
  return getPaymentTerminalSettingsLocal();
}

export function persistPaymentTerminalSettings(
  settings: PaymentTerminalSettings,
): void {
  savePaymentTerminalSettingsLocal(settings);
}

export async function connectPaymentTerminal(): Promise<PaymentTerminalConnectResult> {
  const settings = settingsForConnect();
  agentDebugLog(
    "payment-terminal-service.ts:connect",
    "connect requested",
    {
      transport: settings.transport,
      serialPort: settings.serialPort,
      baudRate: settings.baudRate,
      integratedCheckout: settings.integratedCheckout,
    },
    "H1",
  );
  if (settings.providerId === "NEXO" && settings.transport !== "tcp") {
    return {
      ok: false,
      message:
        "NEXO Retailer requires TCP to the terminal IP. Set Transport to TCP (not USB serial).",
    };
  }

  const wrongPort =
    settings.transport === "serial"
      ? wrongEdcPortMessage(settings.serialPort)
      : null;
  if (wrongPort) {
    agentDebugLog(
      "payment-terminal-service.ts:wrong-port",
      "rejected onboard serial",
      { serialPort: settings.serialPort },
      "H1",
    );
    return { ok: false, message: wrongPort };
  }

  try {
    await manager.connect(settings);
    if (
      settings.providerId === "OPAY_ECR" &&
      settings.transport === "serial"
    ) {
      const echoOk = await manager.status(10_000);
      agentDebugLog(
        "payment-terminal-service.ts:opay-echo",
        "opay echo probe",
        { echoOk, serialPort: settings.serialPort, baudRate: settings.baudRate },
        "H1",
      );
      if (!echoOk) {
        await manager.disconnect();
        return {
          ok: false,
          message:
            "Serial port opened on " +
            settings.serialPort.trim() +
            " but OPay did not reply to ECHO within 10s. On the POS: Menu → SelfcheckoutMode → USB connection, app ≥ 3.4.4, baud 9600.",
        };
      }
    }
    agentDebugLog(
      "payment-terminal-service.ts:connect-ok",
      "connect succeeded",
      { serialPort: settings.serialPort, baudRate: settings.baudRate },
      "H1",
    );
    return { ok: true };
  } catch (err: unknown) {
    agentDebugLog(
      "payment-terminal-service.ts:connect-fail",
      "connect failed",
      {
        error: err instanceof Error ? err.message : String(err),
        baudRate: settings.baudRate,
      },
      "H1",
    );
    const path =
      settings.transport === "serial"
        ? settings.serialPort.trim() || "/dev/ttyACM0"
        : "";
    const message =
      settings.transport === "serial" && path
        ? formatSerialPortOpenError(err, path)
        : err instanceof Error
          ? err.message
          : "Failed to connect payment terminal.";
    return { ok: false, message };
  }
}

export async function disconnectPaymentTerminal(): Promise<void> {
  await manager.disconnect();
}

export async function paymentTerminalStatus(): Promise<boolean> {
  return manager.status();
}

export function paymentTerminalIsLinkUp(): boolean {
  return manager.isLinkUp();
}

export async function paymentTerminalPay(
  request: PaymentRequest,
): Promise<PaymentResult> {
  return manager.pay(request);
}

export async function paymentTerminalInquiry(
  invoiceId: string,
): Promise<PaymentResult> {
  return manager.inquiry(invoiceId);
}

export async function paymentTerminalCancel(
  invoiceId: string,
): Promise<PaymentResult> {
  return manager.cancel(invoiceId);
}
