/** Shared SerialPort open options for Linux USB ACM (Android EDC) devices. */
export function serialPortOpenOptions(path: string, baudRate: number) {
  return {
    path,
    baudRate,
    autoOpen: false,
    /** Avoid EIO when the port was recently used by another open in the same app. */
    lock: false,
    hupcl: false,
  };
}
