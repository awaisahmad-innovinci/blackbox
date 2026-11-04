import type { PaymentResult } from "@blackbox/shared";
import { paymentTerminal } from "./client";

/**
 * Pay on device; on UNKNOWN/TIMEOUT runs one inquiry before giving up.
 * Only APPROVED should allow posting the sale.
 */
export async function payCardOnTerminal(
  invoiceId: string,
  amount: number,
): Promise<PaymentResult> {
  const alreadyUp = await paymentTerminal.isLinkUp();
  const connect = alreadyUp
    ? { ok: true as const }
    : await paymentTerminal.connect();
  if (!connect.ok) {
    return {
      status: "UNKNOWN",
      amount,
      message: connect.message,
    };
  }

  let result = await paymentTerminal.pay({
    invoiceId,
    amount,
    currency: "PKR",
  });

  if (result.status === "UNKNOWN" || result.status === "TIMEOUT") {
    result = await paymentTerminal.inquiry(invoiceId);
    if (result.status === "UNKNOWN" || result.status === "TIMEOUT") {
      return {
        ...result,
        message:
          result.message ??
          "Could not confirm payment. Run inquiry before retrying.",
      };
    }
  }

  return result;
}
