import { randomUUID } from "node:crypto";

/** Terminal orderNo-style id (32 chars max for OPay). */
export function newPaymentTransactionId(): string {
  return randomUUID().replace(/-/g, "").slice(0, 32);
}
