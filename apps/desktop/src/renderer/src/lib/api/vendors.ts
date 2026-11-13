import type {
  CreateVendorRequest,
  PaginatedVendorPayments,
  PaginatedVendors,
  VendorCreditLedger,
  VendorCreditQuery,
  RecordVendorPaymentRequest,
  UpdateVendorRequest,
  VendorDetail,
  VendorLedger,
  VendorListQuery,
  VendorPaymentListQuery,
} from "@blackbox/shared";
import { apiFetch } from "./client";

function toQuery(params: VendorListQuery): string {
  const sp = new URLSearchParams();
  if (params.search) sp.set("search", params.search);
  if (params.status) sp.set("status", params.status);
  if (params.groupId) sp.set("groupId", params.groupId);
  if (params.page) sp.set("page", String(params.page));
  if (params.pageSize) sp.set("pageSize", String(params.pageSize));
  const q = sp.toString();
  return q ? `?${q}` : "";
}

export const vendorsApi = {
  list(params: VendorListQuery = {}): Promise<PaginatedVendors> {
    return apiFetch<PaginatedVendors>(`/vendors${toQuery(params)}`);
  },
  get(id: string): Promise<VendorDetail> {
    return apiFetch<VendorDetail>(`/vendors/${id}`);
  },
  create(body: CreateVendorRequest): Promise<VendorDetail> {
    return apiFetch<VendorDetail>("/vendors", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  update(id: string, body: UpdateVendorRequest): Promise<VendorDetail> {
    return apiFetch<VendorDetail>(`/vendors/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },
  delete(id: string): Promise<VendorDetail> {
    return apiFetch<VendorDetail>(`/vendors/${id}/delete`, { method: "POST" });
  },
  restore(id: string): Promise<VendorDetail> {
    return apiFetch<VendorDetail>(`/vendors/${id}/restore`, { method: "POST" });
  },
  listCredits(params: VendorCreditQuery = {}): Promise<VendorCreditLedger> {
    const sp = new URLSearchParams();
    if (params.vendorId) sp.set("vendorId", params.vendorId);
    const q = sp.toString();
    return apiFetch<VendorCreditLedger>(`/vendors/credits${q ? `?${q}` : ""}`);
  },
  listPayments(
    params: VendorPaymentListQuery = {},
  ): Promise<PaginatedVendorPayments> {
    const sp = new URLSearchParams();
    if (params.search) sp.set("search", params.search);
    if (params.vendorId) sp.set("vendorId", params.vendorId);
    if (params.page) sp.set("page", String(params.page));
    if (params.pageSize) sp.set("pageSize", String(params.pageSize));
    const q = sp.toString();
    return apiFetch<PaginatedVendorPayments>(
      `/vendors/payments${q ? `?${q}` : ""}`,
    );
  },
  ledger(id: string): Promise<VendorLedger> {
    return apiFetch<VendorLedger>(`/vendors/${id}/ledger`);
  },
  recordPayment(
    id: string,
    body: RecordVendorPaymentRequest,
  ): Promise<VendorLedger> {
    return apiFetch<VendorLedger>(`/vendors/${id}/ledger-payments`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
};
