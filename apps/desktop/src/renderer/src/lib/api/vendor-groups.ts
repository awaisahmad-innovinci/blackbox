import type {
  CreateVendorGroupRequest,
  TaxonomyListQuery,
  UpdateVendorGroupRequest,
  VendorGroup,
} from "@blackbox/shared";
import { apiFetch } from "./client";

function listQuery(query?: TaxonomyListQuery): string {
  if (!query) return "";
  const params = new URLSearchParams();
  if (query.status) params.set("status", query.status);
  if (query.q?.trim()) params.set("q", query.q.trim());
  const s = params.toString();
  return s ? `?${s}` : "";
}

export const vendorGroupsApi = {
  list(query?: TaxonomyListQuery): Promise<VendorGroup[]> {
    return apiFetch<VendorGroup[]>(`/vendor-groups${listQuery(query)}`);
  },
  get(id: string): Promise<VendorGroup> {
    return apiFetch<VendorGroup>(`/vendor-groups/${id}`);
  },
  create(body: CreateVendorGroupRequest): Promise<VendorGroup> {
    return apiFetch<VendorGroup>("/vendor-groups", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  update(id: string, body: UpdateVendorGroupRequest): Promise<VendorGroup> {
    return apiFetch<VendorGroup>(`/vendor-groups/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },
  deactivate(id: string): Promise<VendorGroup> {
    return apiFetch<VendorGroup>(`/vendor-groups/${id}/deactivate`, {
      method: "POST",
    });
  },
};
