/**
 * NEXO Retailer wire codec (XML). Acquirer-specific message variants require
 * certification against your terminal's exposed NEXO profile.
 */
import type { PaymentRequest, PaymentResult } from "@blackbox/shared";
import type { PaymentTerminalSettings } from "@blackbox/shared";
import { agentDebugLog } from "../../agent-debug-log";
import type { ProviderProtocolCodec } from "../../types";

export type NexoCodecConfig = Pick<
  PaymentTerminalSettings,
  "terminalId" | "merchantId"
>;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function messageHeader(
  category: string,
  config: NexoCodecConfig,
  saleId: string,
): string {
  const poiId = escapeXml(config.terminalId.trim() || "POI001");
  const serviceId = escapeXml(
    config.merchantId.trim().slice(0, 10) || "BlackboxPOS",
  );
  const sale = escapeXml(saleId.slice(0, 32));
  return `<MessageHeader ProtocolVersion="5.1" MessageClass="Service" MessageCategory="${category}" MessageType="Request" ServiceID="${serviceId}" SaleID="${sale}" POIID="${poiId}"/>`;
}

function paymentRequestXml(
  request: PaymentRequest,
  config: NexoCodecConfig,
): string {
  const ref = request.transactionId?.trim() || request.invoiceId.trim();
  const saleRef = ref.replace(/-/g, "").slice(0, 32);
  const amountMajor = request.amount.toFixed(2);
  return `<?xml version="1.0" encoding="UTF-8"?><SaleToPOIRequest>${messageHeader("Payment", config, saleRef)}<PaymentRequest><SaleData><SaleTransactionID TransactionID="${escapeXml(saleRef)}"/></SaleData><PaymentTransaction><AmountsReq Currency="PKR" RequestedAmount="${amountMajor}"/></PaymentTransaction></PaymentRequest></SaleToPOIRequest>`;
}

function extractXmlAttr(text: string, attr: string): string | null {
  const re = new RegExp(`${attr}="([^"]*)"`, "i");
  const m = text.match(re);
  return m?.[1] ?? null;
}

function mapNexoResultXml(text: string, amount: number): PaymentResult {
  const root =
    text.includes("SaleToPOIResponse")
      ? "response"
      : text.includes("SaleToPOIRequest")
        ? "request"
        : "unknown";

  const result =
    extractXmlAttr(text, "Result") ??
    (text.match(/<Result>([^<]+)<\/Result>/i)?.[1]?.trim() ?? null);

  const errorCondition =
    extractXmlAttr(text, "ErrorCondition") ??
    (text.match(/<ErrorCondition>([^<]+)<\/ErrorCondition>/i)?.[1]?.trim() ??
      null);

  // #region agent log
  agentDebugLog(
    "nexo-retailer-codec.ts:decode",
    "nexo xml parsed",
    { root, result, errorCondition, len: text.length },
    "NEXO",
  );
  // #endregion

  if (root === "request") {
    return {
      status: "UNKNOWN",
      amount,
      message:
        "Terminal echoed the request (invalid NEXO message). Set Terminal ID / Merchant ID in settings and confirm amount format with your acquirer.",
      raw: text.slice(0, 2000),
    };
  }

  if (result && /^Success$/i.test(result)) {
    if (
      text.includes("DiagnosisResponse") ||
      text.includes('MessageCategory="Diagnosis"')
    ) {
      return {
        status: "APPROVED",
        amount,
        message: "NEXO diagnosis ok",
        raw: text.slice(0, 2000),
      };
    }
    return {
      status: "APPROVED",
      amount,
      message: "NEXO approved",
      raw: text.slice(0, 2000),
    };
  }

  if (result && /^Failure$/i.test(result)) {
    if (errorCondition && /cancel/i.test(errorCondition)) {
      return {
        status: "CANCELLED",
        amount,
        message: errorCondition,
        raw: text.slice(0, 2000),
      };
    }
    return {
      status: "DECLINED",
      amount,
      message: errorCondition ?? "NEXO declined",
      raw: text.slice(0, 2000),
    };
  }

  if (errorCondition && /refusal|declin/i.test(errorCondition)) {
    return {
      status: "DECLINED",
      amount,
      message: errorCondition,
      raw: text.slice(0, 2000),
    };
  }

  if (text.toLowerCase().includes("inprogress") || result === "Partial") {
    return {
      status: "PENDING",
      amount,
      message: "NEXO payment in progress",
      raw: text.slice(0, 2000),
    };
  }

  return {
    status: "UNKNOWN",
    amount,
    message:
      "Unrecognized NEXO response. Check Terminal ID and acquirer NEXO profile.",
    raw: text.slice(0, 2000),
  };
}

export function createNexoRetailerCodec(
  config: NexoCodecConfig,
): ProviderProtocolCodec {
  return {
    encodeEcho: () =>
      `<?xml version="1.0" encoding="UTF-8"?><SaleToPOIRequest>${messageHeader("Diagnosis", config, "diag")}<DiagnosisRequest/></SaleToPOIRequest>`,

    encodePayment: (request: PaymentRequest) =>
      paymentRequestXml(request, config),

    encodeInquiry: (reference: string) => {
      const saleRef = reference.replace(/-/g, "").slice(0, 32);
      return `<?xml version="1.0" encoding="UTF-8"?><SaleToPOIRequest>${messageHeader("TransactionStatus", config, saleRef)}<TransactionStatusRequest><MessageReference MessageCategory="Payment" SaleID="${escapeXml(saleRef)}"/></TransactionStatusRequest></SaleToPOIRequest>`;
    },

    encodeCancel: (reference: string) => {
      const saleRef = reference.replace(/-/g, "").slice(0, 32);
      return `<?xml version="1.0" encoding="UTF-8"?><SaleToPOIRequest>${messageHeader("Payment", config, saleRef)}<PaymentRequest><SaleData><SaleTransactionID TransactionID="${escapeXml(saleRef)}"/></SaleData><PaymentTransaction Operation="Abort"/></PaymentTransaction></PaymentRequest></SaleToPOIRequest>`;
    },

    decode: (response: Buffer, amount: number) => {
      const text = response.toString("utf8").trim();
      if (!text) {
        return {
          status: "UNKNOWN",
          amount,
          message: "Empty NEXO response",
        };
      }
      return mapNexoResultXml(text, amount);
    },
  };
}
