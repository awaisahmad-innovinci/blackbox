import type {
  PaymentRequest,
  PaymentResult,
  PaymentTerminalConnectResult,
  PaymentTerminalSettings,
} from "@blackbox/shared";

function api() {
  const terminal = window.blackbox?.paymentTerminal;
  if (!terminal) {
    throw new Error("Payment terminal API is not available in this window.");
  }
  return terminal;
}

export const paymentTerminal = {
  getSettings(): Promise<PaymentTerminalSettings> {
    return api().getSettings();
  },

  saveSettings(settings: PaymentTerminalSettings): Promise<{ ok: true }> {
    return api().saveSettings(settings);
  },

  connect(): Promise<PaymentTerminalConnectResult> {
    return api().connect();
  },

  disconnect(): Promise<void> {
    return api().disconnect();
  },

  status(): Promise<boolean> {
    return api().status();
  },

  isLinkUp(): Promise<boolean> {
    return api().isLinkUp();
  },

  pay(request: PaymentRequest): Promise<PaymentResult> {
    return api().pay(request);
  },

  inquiry(invoiceId: string): Promise<PaymentResult> {
    return api().inquiry(invoiceId);
  },

  cancel(invoiceId: string): Promise<PaymentResult> {
    return api().cancel(invoiceId);
  },
};
