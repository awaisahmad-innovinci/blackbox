import type {
  CreateProductRequest,
  CreateProductSkuRequest,
  PaginatedProducts,
  ProductDetail,
  ProductListQuery,
  ProductSkuDetail,
  ProductSupplierRow,
  StockMovementRow,
  UpdateProductRequest,
  WarehouseStockRow,
} from "@blackbox/shared";
import { apiFetch } from "./client";

function toQuery(params: ProductListQuery): string {
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

export const productsApi = {
  list(params: ProductListQuery = {}): Promise<PaginatedProducts> {
    return apiFetch<PaginatedProducts>(`/products${toQuery(params)}`);
  },
  get(id: string): Promise<ProductDetail> {
    return apiFetch<ProductDetail>(`/products/${id}`);
  },
  create(body: CreateProductRequest): Promise<ProductDetail> {
    return apiFetch<ProductDetail>("/products", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  update(id: string, body: UpdateProductRequest): Promise<ProductDetail> {
    return apiFetch<ProductDetail>(`/products/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },
  deactivate(id: string): Promise<ProductDetail> {
    return apiFetch<ProductDetail>(`/products/${id}/deactivate`, {
      method: "POST",
    });
  },
  listSkus(id: string): Promise<ProductSkuDetail[]> {
    return apiFetch<ProductSkuDetail[]>(`/products/${id}/skus`);
  },
  createSku(
    id: string,
    body: CreateProductSkuRequest,
  ): Promise<ProductSkuDetail> {
    return apiFetch<ProductSkuDetail>(`/products/${id}/skus`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  listSuppliers(id: string): Promise<ProductSupplierRow[]> {
    return apiFetch<ProductSupplierRow[]>(`/products/${id}/suppliers`);
  },
  listInventory(id: string): Promise<WarehouseStockRow[]> {
    return apiFetch<WarehouseStockRow[]>(`/products/${id}/inventory`);
  },
  listMovements(id: string): Promise<StockMovementRow[]> {
    return apiFetch<StockMovementRow[]>(`/products/${id}/movements`);
  },
};
