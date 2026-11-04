export type DataListener = (chunk: Buffer) => void;
export type ErrorListener = (error: Error) => void;

export interface TransportConnection {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  /** True when the transport link is open (no protocol echo). */
  isLinkUp(): boolean;
  write(data: Buffer): Promise<void>;
  onData(listener: DataListener): void;
  onError(listener: ErrorListener): void;
  removeAllListeners(): void;
}
