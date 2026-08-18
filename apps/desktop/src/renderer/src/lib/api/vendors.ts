import type {
  CreateVendorRequest,
  PaginatedVendors,
  UpdateVendorRequest,
  VendorDetail,
  VendorListQuery,
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
};
