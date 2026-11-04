import type { MessageFramer } from "./message-framer";

/** One JSON object per line (OPay USB serial). */
export class NewlineFramer implements MessageFramer {
  private buffer = Buffer.alloc(0);

  reset(): void {
    this.buffer = Buffer.alloc(0);
  }

  frame(outbound: Buffer): Buffer {
    const line = outbound.toString("utf8").trimEnd();
    return Buffer.from(`${line}\n`, "utf8");
  }

  push(chunk: Buffer): Buffer[] {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const messages: Buffer[] = [];

    while (true) {
      const nl = this.buffer.indexOf("\n");
      if (nl < 0) break;
      let line = this.buffer.subarray(0, nl);
      this.buffer = this.buffer.subarray(nl + 1);
      if (line.length > 0 && line[line.length - 1] === 0x0d) {
        line = line.subarray(0, line.length - 1);
      }
      if (line.length > 0) {
        messages.push(line);
      }
    }

    const trimmed = this.buffer.toString("utf8").trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      try {
        JSON.parse(trimmed) as unknown;
        messages.push(Buffer.from(trimmed, "utf8"));
        this.buffer = Buffer.alloc(0);
      } catch {
        /* wait for more bytes */
      }
    }

    return messages;
  }
}
