import type {
  PaginatedProducts,
  ProductListQuery,
  SkuSearchResult,
} from "@blackbox/shared";
import { apiFetch } from "./api-client";

function toProductQuery(params: ProductListQuery = {}): string {
  const sp = new URLSearchParams();
  if (params.search) sp.set("search", params.search);
  if (params.brandId) sp.set("brandId", params.brandId);
  if (params.categoryId) sp.set("categoryId", params.categoryId);
  if (params.status) sp.set("status", params.status);
  if (params.page) sp.set("page", String(params.page));
  if (params.pageSize) sp.set("pageSize", String(params.pageSize));
  const q = sp.toString();
  return q ? `?${q}` : "";
}

export function searchSkus(q?: string): Promise<SkuSearchResult[]> {
  const params = new URLSearchParams();
  if (q?.trim()) params.set("q", q.trim());
  const query = params.toString() ? `?${params.toString()}` : "";
  return apiFetch<SkuSearchResult[]>(`/skus${query}`);
}

export function listProducts(
  query: ProductListQuery = {},
): Promise<PaginatedProducts> {
  return apiFetch<PaginatedProducts>(`/products${toProductQuery(query)}`);
}
