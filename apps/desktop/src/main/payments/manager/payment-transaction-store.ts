import type {
  PaymentRequest,
  PaymentResult,
  PaymentTerminalAttemptStatus,
  PaymentTerminalProviderId,
} from "@blackbox/shared";
import { getLocalDb } from "../../db/index";
import { newPaymentTransactionId } from "../core/transaction-id";

export type PaymentTerminalTransactionRow = {
  id: string;
  invoiceId: string;
  transactionId: string;
  providerId: PaymentTerminalProviderId;
  amount: number;
  currency: string;
  status: PaymentTerminalAttemptStatus;
  terminalTxnId: string | null;
  requestJson: string | null;
  responseJson: string | null;
  createdAt: string;
  updatedAt: string;
};

const UNRESOLVED: PaymentTerminalAttemptStatus[] = [
  "CREATED",
  "SENT",
  "PENDING",
  "UNKNOWN",
  "TIMEOUT",
];

function nowIso(): string {
  return new Date().toISOString();
}

function resultToAttemptStatus(
  status: PaymentResult["status"],
): PaymentTerminalAttemptStatus {
  if (status === "APPROVED") return "APPROVED";
  if (status === "DECLINED") return "DECLINED";
  if (status === "CANCELLED") return "CANCELLED";
  if (status === "PENDING") return "PENDING";
  if (status === "TIMEOUT") return "TIMEOUT";
  return "UNKNOWN";
}

export class PaymentTransactionStore {
  createAttempt(
    request: PaymentRequest,
    providerId: PaymentTerminalProviderId,
  ): { id: string; transactionId: string } {
    const db = getLocalDb();
    const id = newPaymentTransactionId();
    const transactionId =
      request.transactionId?.trim() || newPaymentTransactionId();
    const createdAt = nowIso();
    db.prepare(
      `insert into payment_terminal_transactions (
        id, invoice_id, transaction_id, provider_id, amount, currency, status,
        terminal_txn_id, request_json, response_json, created_at, updated_at
      ) values (
        @id, @invoiceId, @transactionId, @providerId, @amount, @currency, @status,
        null, @requestJson, null, @createdAt, @updatedAt
      )`,
    ).run({
      id,
      invoiceId: request.invoiceId,
      transactionId,
      providerId,
      amount: request.amount,
      currency: request.currency,
      status: "CREATED",
      requestJson: JSON.stringify({ ...request, transactionId }),
      createdAt,
      updatedAt: createdAt,
    });
    return { id, transactionId };
  }

  markSent(rowId: string): void {
    const db = getLocalDb();
    db.prepare(
      `update payment_terminal_transactions
       set status = 'SENT', updated_at = @updatedAt
       where id = @id`,
    ).run({ id: rowId, updatedAt: nowIso() });
  }

  completeAttempt(rowId: string, result: PaymentResult): void {
    const db = getLocalDb();
    db.prepare(
      `update payment_terminal_transactions
       set status = @status,
           terminal_txn_id = @terminalTxnId,
           response_json = @responseJson,
           updated_at = @updatedAt
       where id = @id`,
    ).run({
      id: rowId,
      status: resultToAttemptStatus(result.status),
      terminalTxnId:
        result.terminalTransactionId ?? result.transactionId ?? null,
      responseJson: JSON.stringify(result),
      updatedAt: nowIso(),
    });
  }

  getLatestTransactionIdForInvoice(invoiceId: string): string | null {
    const db = getLocalDb();
    const row = db
      .prepare(
        `select transaction_id as transactionId
         from payment_terminal_transactions
         where invoice_id = @invoiceId
         order by created_at desc
         limit 1`,
      )
      .get({ invoiceId }) as { transactionId: string } | undefined;
    return row?.transactionId ?? null;
  }

  updateLatestByInvoice(invoiceId: string, result: PaymentResult): void {
    const db = getLocalDb();
    const row = db
      .prepare(
        `select id from payment_terminal_transactions
         where invoice_id = @invoiceId
         order by created_at desc
         limit 1`,
      )
      .get({ invoiceId }) as { id: string } | undefined;
    if (!row) return;
    this.completeAttempt(row.id, result);
  }

  listUnresolved(): PaymentTerminalTransactionRow[] {
    const db = getLocalDb();
    const placeholders = UNRESOLVED.map(() => "?").join(", ");
    return db
      .prepare(
        `select
          id,
          invoice_id as invoiceId,
          transaction_id as transactionId,
          provider_id as providerId,
          amount,
          currency,
          status,
          terminal_txn_id as terminalTxnId,
          request_json as requestJson,
          response_json as responseJson,
          created_at as createdAt,
          updated_at as updatedAt
         from payment_terminal_transactions
         where status in (${placeholders})
         order by created_at asc`,
      )
      .all(...UNRESOLVED) as PaymentTerminalTransactionRow[];
  }
}

export const paymentTransactionStore = new PaymentTransactionStore();
