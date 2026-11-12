import type { PosSerialPortInfo } from "@blackbox/shared";

type WriteSerialOptions = {
  /** Open the port and close without writing (connection test). */
  openOnly?: boolean;
};

export async function listSerialPorts(): Promise<PosSerialPortInfo[]> {
  try {
    const { SerialPort } = await import("serialport");
    const ports = await SerialPort.list();
    return ports.map((port) => ({
      path: port.path,
      manufacturer: port.manufacturer,
      serialNumber: port.serialNumber,
    }));
  } catch (err: unknown) {
    console.warn("[card-terminal] listSerialPorts failed:", err);
    return [];
  }
}

export async function writeSerialFrame(
  portPath: string,
  baudRate: number,
  frame: Buffer,
  options?: WriteSerialOptions,
): Promise<void> {
  const { SerialPort } = await import("serialport");

  await new Promise<void>((resolve, reject) => {
    const port = new SerialPort({
      path: portPath,
      baudRate,
      autoOpen: false,
    });

    port.open((openErr) => {
      if (openErr) {
        reject(openErr);
        return;
      }

      if (options?.openOnly) {
        port.close((closeErr) => {
          if (closeErr) reject(closeErr);
          else resolve();
        });
        return;
      }

      port.write(frame, (writeErr) => {
        if (writeErr) {
          port.close(() => reject(writeErr));
          return;
        }
        port.drain((drainErr) => {
          port.close((closeErr) => {
            if (closeErr) reject(closeErr);
            else if (drainErr) reject(drainErr);
            else resolve();
          });
        });
      });
    });
  });
}
