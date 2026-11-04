import type { PaymentRequest, PaymentResult } from "@blackbox/shared";
import { agentDebugLog } from "../agent-debug-log";
import type { PaymentDriver, ProviderProtocolCodec } from "../types";
import type { FramedSession } from "../transport/framed-session";
import type { TransportConnection } from "../transport/connection";

function toBuffer(data: Buffer | string): Buffer {
  return typeof data === "string" ? Buffer.from(data, "utf8") : data;
}

export class EcrWireAdapter implements PaymentDriver {
  private sessionAttached = false;

  constructor(
    private readonly session: FramedSession,
    private readonly protocol: ProviderProtocolCodec,
    private readonly connection: TransportConnection,
    private readonly connectFn: () => Promise<void>,
    private readonly disconnectFn: () => Promise<void>,
  ) {}

  async connect(): Promise<void> {
    if (!this.connection.isLinkUp()) {
      await this.connectFn();
    }
    if (!this.sessionAttached) {
      this.session.attach();
      this.sessionAttached = true;
    }
  }

  async disconnect(): Promise<void> {
    if (this.sessionAttached) {
      this.session.detach();
      this.sessionAttached = false;
    }
    await this.disconnectFn();
  }

  isLinkUp(): boolean {
    return this.connection.isLinkUp();
  }

  async status(echoTimeoutMs?: number): Promise<boolean> {
    try {
      const payload = this.protocol.encodeEcho
        ? toBuffer(this.protocol.encodeEcho())
        : Buffer.from("STATUS", "ascii");
      const response = await this.session.request(payload, echoTimeoutMs);
      if (this.protocol.encodeEcho) {
        const result = this.protocol.decode(response, 0);
        return result.status === "APPROVED";
      }
      return true;
    } catch {
      return false;
    }
  }

  async pay(request: PaymentRequest): Promise<PaymentResult> {
    try {
      const response = await this.session.request(
        toBuffer(this.protocol.encodePayment(request)),
      );
      return this.protocol.decode(response, request.amount);
    } catch (err: unknown) {
      const isTimeout =
        err instanceof Error && err.message.includes("timeout");
      // #region agent log
      agentDebugLog(
        "ecr-wire-adapter.ts:pay-fail",
        "pay request failed",
        {
          isTimeout,
          error: err instanceof Error ? err.message : String(err),
        },
        isTimeout ? "H1" : "H3",
      );
      // #endregion
      const message = isTimeout
        ? "No response from terminal (timeout). For OPay: USB ECR mode and 9600 baud. For NEXO: use TCP and terminal IP."
        : "Payment result unknown. Inquiry required.";
      return {
        status:
          err instanceof Error && err.message.includes("timeout")
            ? "TIMEOUT"
            : "UNKNOWN",
        amount: request.amount,
        message,
      };
    }
  }

  async inquiry(invoiceId: string): Promise<PaymentResult> {
    try {
      const response = await this.session.request(
        toBuffer(this.protocol.encodeInquiry(invoiceId)),
      );
      return this.protocol.decode(response, 0);
    } catch (err: unknown) {
      return {
        status:
          err instanceof Error && err.message.includes("timeout")
            ? "TIMEOUT"
            : "UNKNOWN",
        amount: 0,
        message: "Inquiry failed.",
      };
    }
  }

  async cancel(invoiceId: string): Promise<PaymentResult> {
    try {
      const response = await this.session.request(
        toBuffer(this.protocol.encodeCancel(invoiceId)),
      );
      return this.protocol.decode(response, 0);
    } catch (err: unknown) {
      return {
        status:
          err instanceof Error && err.message.includes("timeout")
            ? "TIMEOUT"
            : "UNKNOWN",
        amount: 0,
        message: "Cancel failed.",
      };
    }
  }
}
