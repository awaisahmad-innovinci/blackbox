import { getPaymentTerminalSettingsLocal } from "./payment-terminal-settings-local";
import {
  connectPaymentTerminal,
  paymentTerminalInquiry,
} from "./payment-terminal-service";
import { paymentTransactionStore } from "./manager/payment-transaction-store";

const LOG_PREFIX = "[payment-terminal]";

/** Resolve UNKNOWN/SENT attempts after restart (inquiry only — never auto-decline). */
export async function reconcilePendingPaymentTerminalTransactions(): Promise<void> {
  const settings = getPaymentTerminalSettingsLocal();
  if (!settings.integratedCheckout) return;

  const pending = paymentTransactionStore.listUnresolved();
  if (pending.length === 0) return;

  console.info(
    LOG_PREFIX,
    "reconciling",
    pending.length,
    "unresolved payment attempt(s)",
  );

  const connected = await connectPaymentTerminal();
  if (!connected.ok) {
    console.warn(LOG_PREFIX, "reconcile skipped:", connected.message);
    return;
  }

  for (const row of pending) {
    try {
      await paymentTerminalInquiry(row.invoiceId);
    } catch (err: unknown) {
      console.warn(
        LOG_PREFIX,
        "reconcile inquiry failed",
        row.invoiceId,
        err,
      );
    }
  }
}
