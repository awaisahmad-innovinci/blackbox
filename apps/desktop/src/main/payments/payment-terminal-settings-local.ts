import {
  DEFAULT_PAYMENT_TERMINAL_SETTINGS,
  type PaymentTerminalFramerId,
  type PaymentTerminalProviderId,
  type PaymentTerminalSettings,
  type PaymentTerminalTransport,
} from "@blackbox/shared";
import { getSyncMeta, setSyncMeta } from "../db/sync-meta";

const SETTINGS_KEY = "pos.payment_terminal_settings";

const PROVIDERS: PaymentTerminalProviderId[] = [
  "OPAY_ECR",
  "MEEZAN_ECR",
  "MCB_ECR",
  "ALFALAH_ECR",
  "ALLIED_ECR",
];

const TRANSPORTS: PaymentTerminalTransport[] = ["tcp", "serial", "bluetooth"];

const FRAMERS: PaymentTerminalFramerId[] = [
  "delimiter",
  "length-prefix",
  "newline",
];

function parseProviderId(value: unknown): PaymentTerminalProviderId {
  if (typeof value === "string" && PROVIDERS.includes(value as PaymentTerminalProviderId)) {
    return value as PaymentTerminalProviderId;
  }
  return DEFAULT_PAYMENT_TERMINAL_SETTINGS.providerId;
}

function parseTransport(value: unknown): PaymentTerminalTransport {
  if (typeof value === "string" && TRANSPORTS.includes(value as PaymentTerminalTransport)) {
    return value as PaymentTerminalTransport;
  }
  return DEFAULT_PAYMENT_TERMINAL_SETTINGS.transport;
}

function parseFramer(value: unknown): PaymentTerminalFramerId {
  if (typeof value === "string" && FRAMERS.includes(value as PaymentTerminalFramerId)) {
    return value as PaymentTerminalFramerId;
  }
  return DEFAULT_PAYMENT_TERMINAL_SETTINGS.framerId;
}

export function getPaymentTerminalSettingsLocal(): PaymentTerminalSettings {
  const raw = getSyncMeta(SETTINGS_KEY);
  if (!raw) return { ...DEFAULT_PAYMENT_TERMINAL_SETTINGS };

  try {
    const parsed = JSON.parse(raw) as Partial<PaymentTerminalSettings>;
    const result: PaymentTerminalSettings = {
      integratedCheckout: parsed.integratedCheckout === true,
      providerId: parseProviderId(parsed.providerId),
      transport: parseTransport(parsed.transport),
      framerId: parseFramer(parsed.framerId),
      host: typeof parsed.host === "string" ? parsed.host : DEFAULT_PAYMENT_TERMINAL_SETTINGS.host,
      port:
        typeof parsed.port === "number" && Number.isFinite(parsed.port)
          ? parsed.port
          : DEFAULT_PAYMENT_TERMINAL_SETTINGS.port,
      serialPort:
        typeof parsed.serialPort === "string"
          ? parsed.serialPort
          : DEFAULT_PAYMENT_TERMINAL_SETTINGS.serialPort,
      baudRate:
        typeof parsed.baudRate === "number" && Number.isFinite(parsed.baudRate)
          ? parsed.baudRate
          : DEFAULT_PAYMENT_TERMINAL_SETTINGS.baudRate,
      terminalId:
        typeof parsed.terminalId === "string"
          ? parsed.terminalId
          : DEFAULT_PAYMENT_TERMINAL_SETTINGS.terminalId,
      merchantId:
        typeof parsed.merchantId === "string"
          ? parsed.merchantId
          : DEFAULT_PAYMENT_TERMINAL_SETTINGS.merchantId,
      operationTimeoutMs:
        typeof parsed.operationTimeoutMs === "number" &&
        parsed.operationTimeoutMs >= 5_000
          ? parsed.operationTimeoutMs
          : DEFAULT_PAYMENT_TERMINAL_SETTINGS.operationTimeoutMs,
      connectTimeoutMs:
        typeof parsed.connectTimeoutMs === "number" &&
        parsed.connectTimeoutMs >= 1_000
          ? parsed.connectTimeoutMs
          : DEFAULT_PAYMENT_TERMINAL_SETTINGS.connectTimeoutMs,
    };
    if (
      result.providerId === "OPAY_ECR" &&
      result.framerId === "delimiter"
    ) {
      result.framerId = "newline";
    }
    return result;
  } catch {
    return { ...DEFAULT_PAYMENT_TERMINAL_SETTINGS };
  }
}

export function savePaymentTerminalSettingsLocal(
  settings: PaymentTerminalSettings,
): void {
  setSyncMeta(SETTINGS_KEY, JSON.stringify(settings));
}
