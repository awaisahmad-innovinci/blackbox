import type { MessageFramer } from "./message-framer";

const STX = 0x02;
const ETX = 0x03;

/** STX … ETX framing (common ECR style; verify against bank docs). */
export class DelimiterFramer implements MessageFramer {
  private buffer = Buffer.alloc(0);

  reset(): void {
    this.buffer = Buffer.alloc(0);
  }

  frame(outbound: Buffer): Buffer {
    return Buffer.concat([
      Buffer.from([STX]),
      outbound,
      Buffer.from([ETX]),
    ]);
  }

  push(chunk: Buffer): Buffer[] {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const messages: Buffer[] = [];

    while (true) {
      const start = this.buffer.indexOf(STX);
      if (start < 0) {
        this.buffer = Buffer.alloc(0);
        break;
      }
      if (start > 0) {
        this.buffer = this.buffer.subarray(start);
      }
      const end = this.buffer.indexOf(ETX, 1);
      if (end < 0) break;

      const payload = this.buffer.subarray(1, end);
      messages.push(payload);
      this.buffer = this.buffer.subarray(end + 1);
    }

    return messages;
  }
}
