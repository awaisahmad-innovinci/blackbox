/**
 * OPay POS USB integration (JSON over serial).
 * @see https://doc OPay merchant docs — Purchase / Inquiry / ECHO; amount in minor units as string.
 */
import type { PaymentRequest, PaymentResult } from "@blackbox/shared";
import type { ProviderProtocolCodec } from "../../types";

/** PKR major units → paisa string (same pattern as OPay kobo: "100" = 1.00). */
export function amountToOpayMinorString(majorAmount: number): string {
  const paisa = Math.round(majorAmount * 100);
  return String(Math.max(0, paisa));
}

/** OPay orderNo: max 32 characters. */
export function opayOrderNo(invoiceId: string): string {
  const compact = invoiceId.replace(/-/g, "").trim();
  if (compact.length <= 32) return compact || "1";
  return compact.slice(0, 32);
}

function mapResponseCode(
  response: Record<string, unknown>,
  amount: number,
): PaymentResult {
  const code = String(response.responseCode ?? "");
  const txn =
    typeof response.transactionNumber === "string"
      ? response.transactionNumber
      : typeof response.orderNumber === "string"
        ? response.orderNumber
        : undefined;
  const message =
    typeof response.response === "string" ? response.response : undefined;

  switch (code) {
    case "202":
      return {
        status: "APPROVED",
        amount,
        transactionId: txn,
        terminalTransactionId: txn,
        message,
        raw: response,
      };
    case "205":
      return {
        status: "DECLINED",
        amount,
        transactionId: txn,
        message,
        raw: response,
      };
    case "201":
      return {
        status: "CANCELLED",
        amount,
        transactionId: txn,
        message,
        raw: response,
      };
    case "203":
      return {
        status: "PENDING",
        amount,
        transactionId: txn,
        message,
        raw: response,
      };
    default:
      return {
        status: "UNKNOWN",
        amount,
        transactionId: txn,
        message,
        raw: response,
      };
  }
}

export function createOpayEcrCodec(): ProviderProtocolCodec {
  return {
    encodeEcho: () => JSON.stringify({ type: "echo" }),

    encodePayment: (request: PaymentRequest) =>
      JSON.stringify({
        amount: amountToOpayMinorString(request.amount),
        type: "purchase",
        orderNo: opayOrderNo(
          request.transactionId?.trim() || request.invoiceId,
        ),
      }),

    encodeInquiry: (reference: string) =>
      JSON.stringify({
        type: "Inquiry",
        orderNo: opayOrderNo(reference),
      }),

    encodeCancel: (reference: string) =>
      JSON.stringify({
        type: "Inquiry",
        orderNo: opayOrderNo(reference),
      }),

    decode: (response: Buffer, amount: number) => {
      const text = response.toString("utf8").trim();
      if (!text) {
        return {
          status: "UNKNOWN",
          amount,
          message: "Empty terminal response",
        };
      }
      try {
        const parsed = JSON.parse(text) as Record<string, unknown>;
        if (String(parsed.type ?? "").toLowerCase() === "echo") {
          return {
            status: "APPROVED",
            amount,
            message: "ECHO ok",
            raw: parsed,
          };
        }
        const minor =
          typeof parsed.amount === "string"
            ? Number(parsed.amount) / 100
            : amount;
        return mapResponseCode(parsed, minor > 0 ? minor : amount);
      } catch {
        return {
          status: "UNKNOWN",
          amount,
          message: "Unparseable terminal response",
          raw: text.slice(0, 500),
        };
      }
    },
  };
}
