import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type {
  Brand,
  Category,
  EntityStatus,
  ProductListItem,
} from "@blackbox/shared";
import { PRODUCT_TYPE_LABELS } from "@blackbox/shared";
import { Button } from "@blackbox/ui/button";
import { Input } from "@blackbox/ui/input";
import { Skeleton } from "@blackbox/ui/skeleton";
import { ApiError } from "@renderer/lib/api/client";
import { brandsApi } from "@renderer/lib/api/brands";
import { categoriesApi } from "@renderer/lib/api/categories";
import { productsApi } from "@renderer/lib/api/products";

export function ProductsListPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<EntityStatus | "">("");
  const [brandId, setBrandId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [brands, setBrands] = useState<Brand[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<ProductListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void brandsApi.list().then(setBrands).catch(() => undefined);
    void categoriesApi.list().then(setCategories).catch(() => undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      setLoading(true);
      setError(null);
      void productsApi
        .list({
          search: search.trim() || undefined,
          status: status || undefined,
          brandId: brandId || undefined,
          categoryId: categoryId || undefined,
        })
        .then((res) => {
          if (!cancelled) setItems(res.items);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setError(
            err instanceof ApiError ? err.message : "Failed to load products",
          );
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [search, status, brandId, categoryId]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Catalog items and SKUs for this store.
          </p>
        </div>
        <Button onClick={() => navigate("/products/new")}>+ Add Product</Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <Input
          className="max-w-xs"
          placeholder="Search name, code, SKU…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="border-input bg-background h-9 rounded-md border px-3 text-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value as EntityStatus | "")}
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <select
          className="border-input bg-background h-9 rounded-md border px-3 text-sm"
          value={brandId}
          onChange={(e) => setBrandId(e.target.value)}
        >
          <option value="">All brands</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <select
          className="border-input bg-background h-9 rounded-md border px-3 text-sm"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {error ? (
        <div
          role="alert"
          className="border-destructive/40 bg-destructive/5 text-destructive rounded-lg border px-4 py-3 text-sm"
        >
          {error}
        </div>
      ) : null}

      <div className="border-border overflow-hidden rounded-lg border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Brand</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">SKUs</th>
              <th className="px-4 py-3 font-medium">Available</th>
              <th className="px-4 py-3 font-medium">Suppliers</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr className="border-border border-t">
                <td colSpan={8} className="px-4 py-4">
                  <Skeleton className="h-8 w-full" />
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr className="border-border border-t">
                <td
                  colSpan={8}
                  className="text-muted-foreground px-4 py-8 text-center"
                >
                  No products found.
                </td>
              </tr>
            ) : (
              items.map((p) => (
                <tr key={p.id} className="border-border border-t">
                  <td className="px-4 py-3">
                    <Link
                      to={`/products/${p.id}`}
                      className="text-primary font-medium hover:underline"
                    >
                      {p.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{p.brandName || "—"}</td>
                  <td className="px-4 py-3">{p.categoryName || "—"}</td>
                  <td className="px-4 py-3">
                    {PRODUCT_TYPE_LABELS[p.productType]}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{p.skuCount}</td>
                  <td className="px-4 py-3 tabular-nums">{p.totalAvailable}</td>
                  <td className="px-4 py-3 tabular-nums">{p.supplierCount}</td>
                  <td className="px-4 py-3 capitalize">{p.status}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
