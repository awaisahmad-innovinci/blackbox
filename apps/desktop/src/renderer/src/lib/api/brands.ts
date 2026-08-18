import type {
  Brand,
  CreateBrandRequest,
  TaxonomyListQuery,
  UpdateBrandRequest,
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

export const brandsApi = {
  list(query?: TaxonomyListQuery): Promise<Brand[]> {
    return apiFetch<Brand[]>(`/brands${listQuery(query)}`);
  },
  get(id: string): Promise<Brand> {
    return apiFetch<Brand>(`/brands/${id}`);
  },
  create(body: CreateBrandRequest): Promise<Brand> {
    return apiFetch<Brand>("/brands", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  update(id: string, body: UpdateBrandRequest): Promise<Brand> {
    return apiFetch<Brand>(`/brands/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },
  deactivate(id: string): Promise<Brand> {
    return apiFetch<Brand>(`/brands/${id}/deactivate`, { method: "POST" });
  },
};
