import { wrongEdcPortMessage } from "./serial-port-edc";

export function formatSerialPortOpenError(
  err: unknown,
  portPath: string,
): string {
  const wrongPort = wrongEdcPortMessage(portPath);
  if (wrongPort) return wrongPort;

  const msg = err instanceof Error ? err.message : String(err);
  if (
    msg.includes("Permission denied") ||
    msg.includes("EACCES") ||
    msg.toLowerCase().includes("access denied")
  ) {
    return `Cannot open ${portPath}. On Linux, run: sudo usermod -aG dialout $USER — then fully log out and sign back in (or reboot).`;
  }
  if (msg.includes("ENOENT") || msg.includes("No such file")) {
    return `Serial port ${portPath} not found. Reconnect the USB cable and refresh the port list.`;
  }
  if (msg.includes("custom baud rate") || msg.includes("Input/output error")) {
    return `Cannot configure ${portPath} (${msg}). Unplug and replug the USB cable, close other apps using the port, use one baud rate in both card-terminal sections (try 115200), then retry.`;
  }
  return msg || `Failed to open ${portPath}.`;
}
