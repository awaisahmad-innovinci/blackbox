import type { MessageFramer } from "./message-framer";

/** 2-byte big-endian length prefix + payload. */
export class LengthPrefixFramer implements MessageFramer {
  private buffer = Buffer.alloc(0);

  reset(): void {
    this.buffer = Buffer.alloc(0);
  }

  frame(outbound: Buffer): Buffer {
    const len = Buffer.alloc(2);
    len.writeUInt16BE(outbound.length, 0);
    return Buffer.concat([len, outbound]);
  }

  push(chunk: Buffer): Buffer[] {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const messages: Buffer[] = [];

    while (this.buffer.length >= 2) {
      const length = this.buffer.readUInt16BE(0);
      if (this.buffer.length < 2 + length) break;
      messages.push(this.buffer.subarray(2, 2 + length));
      this.buffer = this.buffer.subarray(2 + length);
    }

    return messages;
  }
}
