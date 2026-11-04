import net from "node:net";
import type {
  DataListener,
  ErrorListener,
  TransportConnection,
} from "./connection";

export class TcpConnection implements TransportConnection {
  private socket?: net.Socket;
  private dataListeners: DataListener[] = [];
  private errorListeners: ErrorListener[] = [];
  private connectGeneration = 0;

  constructor(
    private readonly host: string,
    private readonly port: number,
    private readonly connectTimeoutMs: number,
  ) {}

  isLinkUp(): boolean {
    return Boolean(this.socket && !this.socket.destroyed);
  }

  async connect(): Promise<void> {
    if (this.isLinkUp()) return;

    const generation = ++this.connectGeneration;
    const socket = new net.Socket();
    this.socket = socket;

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.destroy();
        if (generation === this.connectGeneration) {
          this.socket = undefined;
        }
        reject(new Error("TCP connect timeout"));
      }, this.connectTimeoutMs);

      const onError = (err: Error) => {
        clearTimeout(timer);
        if (generation === this.connectGeneration) {
          this.socket = undefined;
        }
        reject(err);
      };

      socket.once("error", onError);
      socket.connect(this.port, this.host, () => {
        if (generation !== this.connectGeneration) {
          socket.destroy();
          return;
        }
        clearTimeout(timer);
        socket.removeListener("error", onError);
        socket.on("data", (chunk: Buffer) => {
          for (const listener of this.dataListeners) listener(chunk);
        });
        socket.on("error", (err: Error) => {
          for (const listener of this.errorListeners) listener(err);
        });
        resolve();
      });
    });
  }

  async disconnect(): Promise<void> {
    this.connectGeneration += 1;
    this.socket?.destroy();
    this.socket = undefined;
    this.dataListeners = [];
    this.errorListeners = [];
  }

  async write(data: Buffer): Promise<void> {
    if (!this.socket) throw new Error("Terminal not connected");
    await new Promise<void>((resolve, reject) => {
      this.socket!.write(data, (err) => {
        if (err) reject(err);
        else resolve();
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
