import type { PosCardTerminalAmountScale } from "@blackbox/shared";

/** Round to 2 decimal places for PKR display on terminal. */
export function formatTerminalAmountMajor(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  return rounded.toFixed(2);
}

export function amountToTerminalPayload(
  amount: number,
  scale: PosCardTerminalAmountScale,
): string {
  if (scale === "minor") {
    const minor = Math.round(amount * 100);
    return String(minor);
  }
  return formatTerminalAmountMajor(amount);
}
