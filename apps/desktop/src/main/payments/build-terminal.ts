import type { PaymentTerminalSettings } from "@blackbox/shared";
import { EcrWireAdapter } from "./adapters/ecr-wire-adapter";
import { resolveProviderCodec } from "./adapters/registry";
import type { TerminalAdapter } from "./types";
import { BluetoothConnection } from "./transport/bluetooth-connection";
import { DelimiterFramer } from "./transport/framers/delimiter-framer";
import { LengthPrefixFramer } from "./transport/framers/length-prefix-framer";
import { NewlineFramer } from "./transport/framers/newline-framer";
import { FramedSession } from "./transport/framed-session";
import { SerialConnection } from "./transport/serial-connection";
import { TcpConnection } from "./transport/tcp-connection";
import type { PaymentTerminalFramerId, PaymentTerminalProviderId } from "@blackbox/shared";

function resolveFramer(
  framerId: PaymentTerminalFramerId,
  providerId: PaymentTerminalProviderId,
) {
  if (framerId === "length-prefix") return new LengthPrefixFramer();
  if (framerId === "newline") return new NewlineFramer();
  if (framerId === "delimiter") return new DelimiterFramer();
  if (providerId === "OPAY_ECR") return new NewlineFramer();
  if (providerId === "NEXO") return new LengthPrefixFramer();
  return new DelimiterFramer();
}

export function buildTerminalAdapter(
  settings: PaymentTerminalSettings,
): TerminalAdapter {
  const codec = resolveProviderCodec(settings.providerId, settings);
  const framer = resolveFramer(settings.framerId, settings.providerId);

  let connection;
  switch (settings.transport) {
    case "tcp":
      connection = new TcpConnection(
        settings.host.trim() || "127.0.0.1",
        settings.port > 0 ? settings.port : 9000,
        settings.connectTimeoutMs,
      );
      break;
    case "serial": {
      const path = settings.serialPort.trim();
      if (!path) {
        throw new Error("Serial port path is required for serial transport.");
      }
      connection = new SerialConnection(path, settings.baudRate);
      break;
    }
    case "bluetooth":
      connection = new BluetoothConnection();
      break;
    default:
      throw new Error(`Unsupported transport: ${settings.transport}`);
  }

  const session = new FramedSession(
    connection,
    framer,
    settings.operationTimeoutMs,
  );

  return new EcrWireAdapter(
    session,
    codec,
    connection,
    () => connection.connect(),
    () => connection.disconnect(),
  );
}
