export type SalePaymentMode = "cash" | "card" | "split";

type DraftPaymentLike = { method: string; amount: number };

export function resolveCardTerminalAmount(
  paymentMode: SalePaymentMode,
  amountDue: number,
  payment: DraftPaymentLike | null,
  splitAmounts: { cash: number; card: number } | null,
): number | null {
  if (!(amountDue > 0)) return null;

  if (paymentMode === "card") {
    const amount = payment?.amount ?? amountDue;
    return amount > 0 ? amount : null;
  }

  if (paymentMode === "split" && splitAmounts) {
    if (!(splitAmounts.cash > 0) || !(splitAmounts.card > 0)) return null;
    return splitAmounts.card;
  }

  return null;
}
