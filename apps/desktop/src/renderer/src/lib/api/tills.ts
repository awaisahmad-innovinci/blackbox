import type {
  CollectTillCashByAmountRequest,
  OpenTillRequest,
  ReopenTillRequest,
  TillListItem,
  TillSessionDetail,
  TillStatus,
  WithdrawTillRequest,
} from "@blackbox/shared";
import { apiFetch } from "./client";

export const tillsApi = {
  getCurrent(): Promise<TillSessionDetail | null> {
    return apiFetch<TillSessionDetail | null>("/tills/current");
  },
  list(query: { status?: TillStatus; userId?: string } = {}): Promise<TillListItem[]> {
    const params = new URLSearchParams();
    if (query.status) params.set("status", query.status);
    if (query.userId) params.set("userId", query.userId);
    const q = params.toString() ? `?${params.toString()}` : "";
    return apiFetch<TillListItem[]>(`/tills${q}`);
  },
  open(body: OpenTillRequest): Promise<TillSessionDetail> {
    return apiFetch<TillSessionDetail>("/tills/open", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  approve(id: string): Promise<TillSessionDetail> {
    return apiFetch<TillSessionDetail>(`/tills/${id}/approve`, {
      method: "POST",
    });
  },
  collectCash(id: string, body: WithdrawTillRequest): Promise<TillSessionDetail> {
    return apiFetch<TillSessionDetail>(`/tills/${id}/collect-cash`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  collectCashByAmount(
    body: CollectTillCashByAmountRequest,
  ): Promise<TillSessionDetail> {
    return apiFetch<TillSessionDetail>("/tills/current/collect-cash-by-amount", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  withdraw(id: string, body: WithdrawTillRequest): Promise<TillSessionDetail> {
    return apiFetch<TillSessionDetail>(`/tills/${id}/withdraw`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  reopen(id: string, body: ReopenTillRequest): Promise<TillSessionDetail> {
    return apiFetch<TillSessionDetail>(`/tills/${id}/reopen`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  closeCurrent(): Promise<TillSessionDetail> {
    return apiFetch<TillSessionDetail>("/tills/current/close", {
      method: "POST",
    });
  },
};
