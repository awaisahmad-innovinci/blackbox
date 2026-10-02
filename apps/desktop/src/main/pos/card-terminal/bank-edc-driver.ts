import type {
  PosCardTerminalPushResult,
  PosCardTerminalSettings,
} from "@blackbox/shared";
import { amountToTerminalPayload } from "./amount-format";
import { pushAmountViaHidKeys } from "./hid-keys-driver";
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
    const message =
      err instanceof Error ? err.message : "Failed to send amount to terminal.";
    return { ok: false, message };
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
    const message =
      err instanceof Error ? err.message : "Could not open serial port.";
    return { ok: false, message };
  }
}
