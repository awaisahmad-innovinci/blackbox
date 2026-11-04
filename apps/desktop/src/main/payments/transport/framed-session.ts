import { agentDebugLog } from "../agent-debug-log";
import type { MessageFramer } from "./framers/message-framer";
import type { TransportConnection } from "./connection";

function wirePreview(buf: Buffer, max = 120): string {
  const slice = buf.subarray(0, max);
  const text = slice.toString("utf8").replace(/\s+/g, " ").trim();
  if (text.length > 0 && /^[\x20-\x7e]+$/.test(text)) return text;
  return slice.toString("hex");
}

export class FramedSession {
  private requestQueue: Promise<void> = Promise.resolve();
  private dataListener?: (chunk: Buffer) => void;
  private errorListener?: (error: Error) => void;
  private pending:
    | {
        resolve: (msg: Buffer) => void;
        reject: (err: Error) => void;
        timer: ReturnType<typeof setTimeout>;
      }
    | undefined;

  constructor(
    private readonly connection: TransportConnection,
    private readonly framer: MessageFramer,
    private readonly operationTimeoutMs: number,
  ) {}

  attach(): void {
    this.dataListener = (chunk: Buffer) => {
      const messages = this.framer.push(chunk);
      // #region agent log
      if (messages.length === 0) {
        agentDebugLog(
          "framed-session.ts:raw-chunk",
          "serial/tcp bytes without complete frame",
          {
            chunkLen: chunk.length,
            preview: wirePreview(chunk, 80),
          },
          "H2",
        );
      }
      // #endregion
      if (messages.length > 0 && this.pending) {
        const p = this.pending;
        this.pending = undefined;
        clearTimeout(p.timer);
        agentDebugLog(
          "framed-session.ts:rx",
          "terminal response frame",
          {
            len: messages[0]!.length,
            preview: wirePreview(messages[0]!),
          },
          "OPAY",
        );
        p.resolve(messages[0]!);
      }
    };
    this.errorListener = (error: Error) => {
      if (this.pending) {
        const p = this.pending;
        this.pending = undefined;
        clearTimeout(p.timer);
        p.reject(error);
      }
    };
    this.connection.onData(this.dataListener);
    this.connection.onError(this.errorListener);
  }

  detach(): void {
    this.connection.removeAllListeners();
    this.dataListener = undefined;
    this.errorListener = undefined;
    this.clearPending(new Error("Session closed"));
    this.framer.reset();
  }

  async request(
    outbound: Buffer,
    timeoutOverrideMs?: number,
  ): Promise<Buffer> {
    const execute = (): Promise<Buffer> =>
      this.requestOnce(outbound, timeoutOverrideMs);
    const next = this.requestQueue.then(execute, execute);
    this.requestQueue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private async requestOnce(
    outbound: Buffer,
    timeoutOverrideMs?: number,
  ): Promise<Buffer> {
    if (this.pending) {
      throw new Error("Terminal request already in progress");
    }

    const framed = this.framer.frame(outbound);
    agentDebugLog(
      "framed-session.ts:tx",
      "terminal request frame",
      { len: framed.length, preview: wirePreview(outbound) },
      "OPAY",
    );
    const waitMs = timeoutOverrideMs ?? this.operationTimeoutMs;
    return new Promise<Buffer>((resolve, reject) => {
      const timer = setTimeout(() => {
        // #region agent log
        agentDebugLog(
          "framed-session.ts:timeout",
          "terminal operation timeout",
          { operationTimeoutMs: waitMs },
          "H1",
        );
        // #endregion
        this.pending = undefined;
        reject(new Error("Terminal operation timeout"));
      }, waitMs);

      this.pending = { resolve, reject, timer };

      void this.connection.write(framed).catch((err: unknown) => {
        if (this.pending) {
          clearTimeout(this.pending.timer);
          this.pending = undefined;
        }
        reject(err instanceof Error ? err : new Error(String(err)));
      });
    });
  }

  private clearPending(err: Error): void {
    if (!this.pending) return;
    clearTimeout(this.pending.timer);
    this.pending.reject(err);
    this.pending = undefined;
  }
}
