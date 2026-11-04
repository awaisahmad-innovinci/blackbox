import type { TransportConnection } from "./connection";

/** Placeholder — use the provider's official Bluetooth SDK/protocol. */
export class BluetoothConnection implements TransportConnection {
  async connect(): Promise<void> {
    throw new Error(
      "Bluetooth transport requires a provider-specific SDK adapter. TCP or serial ECR is supported today.",
    );
  }

  async disconnect(): Promise<void> {}

  isLinkUp(): boolean {
    return false;
  }

  async write(): Promise<void> {
    throw new Error("Bluetooth transport not configured");
  }

  onData(): void {}

  onError(): void {}

  removeAllListeners(): void {}
}
