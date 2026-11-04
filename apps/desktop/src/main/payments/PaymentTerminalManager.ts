import type { PaymentRequest, PaymentResult } from "@blackbox/shared";
import { buildTerminalAdapter } from "./build-terminal";
import {
  canStartPay,
  clearReconciliation,
  markNeedsInquiry,
  stateAfterResult,
} from "./reconciliation";
import type { ReconciliationState } from "./reconciliation";
import type { PaymentTerminalSettings } from "@blackbox/shared";
import { agentDebugLog } from "./agent-debug-log";
import type { PaymentDriver } from "./types";
import { paymentTransactionStore } from "./manager/payment-transaction-store";

const LOG_PREFIX = "[payment-terminal]";

function settingsKey(settings: PaymentTerminalSettings): string {
  return JSON.stringify({
    providerId: settings.providerId,
    transport: settings.transport,
    framerId: settings.framerId,
    host: settings.host,
    port: settings.port,
    serialPort: settings.serialPort,
    baudRate: settings.baudRate,
    terminalId: settings.terminalId,
    merchantId: settings.merchantId,
    operationTimeoutMs: settings.operationTimeoutMs,
    connectTimeoutMs: settings.connectTimeoutMs,
  });
}

export class PaymentTerminalManager {
  private terminal?: PaymentDriver;
  private connectedKey?: string;
  private connectedSettings?: PaymentTerminalSettings;
  private reconciliation = new Map<string, ReconciliationState>();

  isLinkUp(): boolean {
    return Boolean(this.terminal?.isLinkUp());
  }

  async connect(settings: PaymentTerminalSettings): Promise<void> {
    const key = settingsKey(settings);
    if (this.terminal && this.connectedKey === key && this.terminal.isLinkUp()) {
      agentDebugLog(
        "PaymentTerminalManager.ts:connect",
        "reuse existing session",
        { providerId: settings.providerId },
        "H5",
      );
      return;
    }

    agentDebugLog(
      "PaymentTerminalManager.ts:connect",
      "manager connect start",
      { hadTerminal: Boolean(this.terminal), providerId: settings.providerId },
      "H5",
    );

    if (this.terminal && this.connectedKey !== key) {
      await this.disconnect();
    } else if (this.terminal && !this.terminal.isLinkUp()) {
      await this.disconnect();
    }

    if (!this.terminal || this.connectedKey !== key) {
      this.terminal = buildTerminalAdapter(settings);
      this.connectedKey = key;
    }

    this.connectedSettings = settings;
    await this.terminal.connect();
    console.info(LOG_PREFIX, "connected", settings.providerId, settings.transport);
  }

  async disconnect(): Promise<void> {
    if (this.terminal) {
      try {
        await this.terminal.disconnect();
      } catch (err: unknown) {
        console.warn(LOG_PREFIX, "disconnect error", err);
      }
    }
    this.terminal = undefined;
    this.connectedKey = undefined;
    this.connectedSettings = undefined;
  }

  async status(echoTimeoutMs?: number): Promise<boolean> {
    if (!this.terminal?.isLinkUp()) return false;
    return this.terminal.status(echoTimeoutMs);
  }

  async pay(request: PaymentRequest): Promise<PaymentResult> {
    const gate = canStartPay(request.invoiceId, this.reconciliation);
    if (!gate.allowed) {
      return {
        status: "UNKNOWN",
        amount: request.amount,
        message: gate.message,
      };
    }

    if (!this.terminal) {
      throw new Error("Payment terminal not connected");
    }

    const providerId =
      this.connectedSettings?.providerId ?? ("OPAY_ECR" as const);
    const attempt = paymentTransactionStore.createAttempt(request, providerId);
    paymentTransactionStore.markSent(attempt.id);
    const result = await this.terminal.pay({
      ...request,
      transactionId: attempt.transactionId,
    });
    paymentTransactionStore.completeAttempt(attempt.id, result);
    this.applyReconciliation(request.invoiceId, result);
    console.info(LOG_PREFIX, "pay", request.invoiceId, result.status);
    return result;
  }

  async inquiry(invoiceId: string): Promise<PaymentResult> {
    if (!this.terminal) {
      throw new Error("Payment terminal not connected");
    }

    const reference =
      paymentTransactionStore.getLatestTransactionIdForInvoice(invoiceId) ??
      invoiceId;
    const result = await this.terminal.inquiry(reference);
    paymentTransactionStore.updateLatestByInvoice(invoiceId, result);
    if (result.status === "APPROVED" || result.status === "DECLINED") {
      clearReconciliation(invoiceId, this.reconciliation);
    } else if (stateAfterResult(result) === "needs_inquiry") {
      markNeedsInquiry(invoiceId, this.reconciliation);
    } else {
      clearReconciliation(invoiceId, this.reconciliation);
    }
    console.info(LOG_PREFIX, "inquiry", invoiceId, result.status);
    return result;
  }

  async cancel(invoiceId: string): Promise<PaymentResult> {
    if (!this.terminal) {
      throw new Error("Payment terminal not connected");
    }

    const result = await this.terminal.cancel(invoiceId);
    if (result.status !== "UNKNOWN" && result.status !== "TIMEOUT") {
      clearReconciliation(invoiceId, this.reconciliation);
    }
    console.info(LOG_PREFIX, "cancel", invoiceId, result.status);
    return result;
  }

  private applyReconciliation(invoiceId: string, result: PaymentResult): void {
    if (stateAfterResult(result) === "needs_inquiry") {
      markNeedsInquiry(invoiceId, this.reconciliation);
    } else {
      clearReconciliation(invoiceId, this.reconciliation);
    }
  }
}
