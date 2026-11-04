import type {
  PosCardTerminalPushResult,
  PosCardTerminalSettings,
} from "@blackbox/shared";
import { amountToTerminalPayload } from "./amount-format";
import { pushAmountViaHidKeys } from "./hid-keys-driver";
import { agentDebugLog } from "../../payments/agent-debug-log";
import { wrongEdcPortMessage } from "./serial-port-edc";
import { formatSerialPortOpenError } from "./serial-port-error";
import { writeSerialFrame } from "./serial-transport";

/**
 * Set to true after your bank provides the ECR frame spec and
 * `encodeBankEdcAmountFrame` is implemented below.
 */
const BANK_EDC_SERIAL_PROTOCOL_READY = false;

/**
 * Replace with the bank/vendor ECR amount command when documentation is available.
 * @see docs/pos-card-terminal.md
 */
export function encodeBankEdcAmountFrame(
  payload: string,
  _settings: PosCardTerminalSettings,
): Buffer {
  // Placeholder layout for development / sniffing — do not use in production until verified.
  return Buffer.from(`\x02AMT\x1c${payload}\x1c\x03`, "ascii");
}

export async function pushBankEdcAmount(
  amount: number,
  settings: PosCardTerminalSettings,
): Promise<PosCardTerminalPushResult> {
  const payload = amountToTerminalPayload(amount, settings.amountScale);

  // #region agent log
  agentDebugLog(
    "bank-edc-driver.ts:push",
    "pushBankEdcAmount",
    {
      type: settings.connection.type,
      portPath: settings.connection.portPath,
      baudRate: settings.connection.baudRate,
    },
    "H4",
  );
  // #endregion

  if (settings.connection.type === "hid-keys") {
    return pushAmountViaHidKeys(payload);
  }

  const portPath = settings.connection.portPath.trim();
  if (!portPath) {
    return {
      ok: false,
      message: "Select a serial port for the card terminal.",
    };
  }

  const wrongPort = wrongEdcPortMessage(portPath);
  if (wrongPort) {
    return { ok: false, message: wrongPort };
  }

  if (!BANK_EDC_SERIAL_PROTOCOL_READY) {
    return {
      ok: false,
      message:
        "Bank EDC serial protocol is not configured yet. Ask your bank for ECR integration docs, then implement encodeBankEdcAmountFrame in bank-edc-driver.ts. You can use HID keyboard mode in settings until then.",
    };
  }

  const frame = encodeBankEdcAmountFrame(payload, settings);
  try {
    await writeSerialFrame(portPath, settings.connection.baudRate, frame);
    return { ok: true };
  } catch (err: unknown) {
    return {
      ok: false,
      message: formatSerialPortOpenError(err, portPath),
    };
  }
}

export async function testBankEdcSerialPort(
  settings: PosCardTerminalSettings,
): Promise<PosCardTerminalPushResult> {
  const portPath = settings.connection.portPath.trim();
  if (!portPath) {
    return {
      ok: false,
      message: "Select a serial port before testing.",
    };
  }
  try {
    await writeSerialFrame(
      portPath,
      settings.connection.baudRate,
      Buffer.from("", "ascii"),
      { openOnly: true },
    );
    return { ok: true };
  } catch (err: unknown) {
    return {
      ok: false,
      message: formatSerialPortOpenError(err, portPath),
    };
  }
}
