export interface MessageFramer {
  frame(outbound: Buffer): Buffer;
  push(chunk: Buffer): Buffer[];
  reset(): void;
}
