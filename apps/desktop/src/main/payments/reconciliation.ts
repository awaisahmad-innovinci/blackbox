import type { PaymentResult, PaymentStatus } from "@blackbox/shared";

export type ReconciliationState = "clear" | "needs_inquiry";

const UNRESOLVED: PaymentStatus[] = ["UNKNOWN", "TIMEOUT", "PENDING"];

export function stateAfterResult(result: PaymentResult): ReconciliationState {
  if (UNRESOLVED.includes(result.status)) return "needs_inquiry";
  return "clear";
}

export function canStartPay(
  invoiceId: string,
  states: Map<string, ReconciliationState>,
): { allowed: true } | { allowed: false; message: string } {
  if (states.get(invoiceId) === "needs_inquiry") {
    return {
      allowed: false,
      message:
        "Previous payment result is unknown. Run inquiry on this invoice before paying again.",
    };
  }
  return { allowed: true };
}

export function clearReconciliation(
  invoiceId: string,
  states: Map<string, ReconciliationState>,
): void {
  states.set(invoiceId, "clear");
}

export function markNeedsInquiry(
  invoiceId: string,
  states: Map<string, ReconciliationState>,
): void {
  states.set(invoiceId, "needs_inquiry");
}
