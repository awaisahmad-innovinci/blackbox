import type {
  PaymentRequest,
  PaymentResult,
  PaymentTerminalSettings,
} from "@blackbox/shared";

export type { PaymentRequest, PaymentResult, PaymentTerminalSettings };

export interface ProviderProtocolCodec {
  /** OPay: `{"type":"echo"}` — connection test. */
  encodeEcho?(): Buffer | string;
  encodePayment(request: PaymentRequest): Buffer | string;
  encodeInquiry(invoiceId: string): Buffer | string;
  encodeCancel(invoiceId: string): Buffer | string;
  decode(response: Buffer, amount: number): PaymentResult;
}

export interface PaymentDriver {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  /** Transport link up (serial open / TCP connected). */
  isLinkUp(): boolean;
  status(echoTimeoutMs?: number): Promise<boolean>;
  pay(request: PaymentRequest): Promise<PaymentResult>;
  inquiry(invoiceId: string): Promise<PaymentResult>;
  cancel(invoiceId: string): Promise<PaymentResult>;
}

/** @deprecated Use PaymentDriver */
export type TerminalAdapter = PaymentDriver;

export interface TerminalBuildContext {
  settings: PaymentTerminalSettings;
  operationTimeoutMs: number;
}
