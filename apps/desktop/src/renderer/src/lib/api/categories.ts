import type {
  Category,
  CreateCategoryRequest,
  TaxonomyListQuery,
  UpdateCategoryRequest,
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

export const categoriesApi = {
  list(query?: TaxonomyListQuery): Promise<Category[]> {
    return apiFetch<Category[]>(`/categories${listQuery(query)}`);
  },
  get(id: string): Promise<Category> {
    return apiFetch<Category>(`/categories/${id}`);
  },
  create(body: CreateCategoryRequest): Promise<Category> {
    return apiFetch<Category>("/categories", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  update(id: string, body: UpdateCategoryRequest): Promise<Category> {
    return apiFetch<Category>(`/categories/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },
  deactivate(id: string): Promise<Category> {
    return apiFetch<Category>(`/categories/${id}/deactivate`, {
      method: "POST",
    });
  },
};
