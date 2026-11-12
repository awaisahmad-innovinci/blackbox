import type {
  CashExpenseRow,
  CashFlowReport,
  DrawerPerson,
  RecordCashExpenseRequest,
  RecordManagerDrawerOpeningRequest,
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
  listManagers(): Promise<DrawerPerson[]> {
    return apiFetch<DrawerPerson[]>("/cash-flow/managers");
  },
  recordOpening(body: RecordManagerDrawerOpeningRequest): Promise<{ id: string }> {
    return apiFetch<{ id: string }>("/cash-flow/drawer-openings", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  recordOwnerCash(
    amount: number,
    note?: string,
  ): Promise<{ id: string; amount: number }> {
    return apiFetch<{ id: string; amount: number }>("/cash-flow/owner-cash", {
      method: "POST",
      body: JSON.stringify({ amount, note }),
    });
  },
  submit(amount: number): Promise<{ id: string; amount: number }> {
    return apiFetch<{ id: string; amount: number }>("/cash-flow/drawer-submissions", {
      method: "POST",
      body: JSON.stringify({ amount }),
    });
  },
};
