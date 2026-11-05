import type {
  CashExpenseRow,
  CashFlowReport,
  RecordCashExpenseRequest,
} from "@blackbox/shared";
import { apiFetch } from "./client";

export const cashFlowApi = {
  get(from: string, to: string): Promise<CashFlowReport> {
    const params = new URLSearchParams({ from, to });
    return apiFetch<CashFlowReport>(`/cash-flow?${params.toString()}`);
  },
  record(body: RecordCashExpenseRequest): Promise<CashExpenseRow> {
    return apiFetch<CashExpenseRow>("/cash-flow/expenses", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
};
