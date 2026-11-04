import type { SerialPort } from "serialport";
import { agentDebugLog } from "../agent-debug-log";
import { serialPortOpenOptions } from "../../pos/card-terminal/serial-port-options";
import type {
  DataListener,
  ErrorListener,
  TransportConnection,
} from "./connection";

export class SerialConnection implements TransportConnection {
  private port?: SerialPort;
  private dataListeners: DataListener[] = [];
  private errorListeners: ErrorListener[] = [];
  /** Incremented on disconnect; stale open callbacks are ignored. */
  private openGeneration = 0;

  constructor(
    private readonly path: string,
    private readonly baudRate: number,
  ) {}

  isLinkUp(): boolean {
    return Boolean(this.port?.isOpen);
  }

  async connect(): Promise<void> {
    if (this.port?.isOpen) return;

    const { SerialPort } = await import("serialport");
    const generation = ++this.openGeneration;
    agentDebugLog(
      "serial-connection.ts:connect",
      "opening serial port",
      { path: this.path, baudRate: this.baudRate, generation },
      "H3",
    );

    const port = new SerialPort(serialPortOpenOptions(this.path, this.baudRate));
    this.port = port;

    await new Promise<void>((resolve, reject) => {
      port.open((err) => {
        if (generation !== this.openGeneration) {
          try {
            if (port.isOpen) port.close(() => undefined);
          } catch {
            /* ignore */
          }
          return;
        }

        if (err) {
          this.port = undefined;
          agentDebugLog(
            "serial-connection.ts:open-fail",
            "serial open failed",
            {
              path: this.path,
              baudRate: this.baudRate,
              error: err.message,
            },
            "H3",
          );
          reject(err);
          return;
        }

        if (!this.port) {
          reject(new Error("Serial port closed during open"));
          return;
        }

        agentDebugLog(
          "serial-connection.ts:open-ok",
          "serial open ok",
          { path: this.path, baudRate: this.baudRate },
          "H3",
        );

        this.port.on("data", (chunk: Buffer) => {
          for (const listener of this.dataListeners) listener(chunk);
        });
        this.port.on("error", (err: Error) => {
          for (const listener of this.errorListeners) listener(err);
        });
        resolve();
      });
    });
  }

  async disconnect(): Promise<void> {
    this.openGeneration += 1;
    const port = this.port;
    this.port = undefined;
    this.dataListeners = [];
    this.errorListeners = [];

    if (!port?.isOpen) return;

    port.removeAllListeners("data");
    port.removeAllListeners("error");

    await new Promise<void>((resolve, reject) => {
      port.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async write(data: Buffer): Promise<void> {
    if (!this.port?.isOpen) throw new Error("Terminal not connected");
    const port = this.port;
    await new Promise<void>((resolve, reject) => {
      port.write(data, (err) => {
        if (err) reject(err);
        else {
          port.drain((drainErr) => {
            if (drainErr) reject(drainErr);
            else resolve();
          });
        }
      });
    });
  }

  onData(listener: DataListener): void {
    this.dataListeners.push(listener);
  }

  onError(listener: ErrorListener): void {
    this.errorListeners.push(listener);
  }

  removeAllListeners(): void {
    this.dataListeners = [];
    this.errorListeners = [];
  }
}
