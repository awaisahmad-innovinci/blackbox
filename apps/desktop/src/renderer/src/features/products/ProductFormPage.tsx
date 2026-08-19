import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { Brand, Category, EntityStatus, ProductType } from "@blackbox/shared";
import { PRODUCT_TYPES, PRODUCT_TYPE_LABELS } from "@blackbox/shared";
import { Button } from "@blackbox/ui/button";
import { Input } from "@blackbox/ui/input";
import { Label } from "@blackbox/ui/label";
import { Textarea } from "@blackbox/ui/textarea";
import { getApiErrorMessage } from "@renderer/lib/api/client";
import { brandsApi } from "@renderer/lib/api/brands";
import { categoriesApi } from "@renderer/lib/api/categories";
import { productsApi } from "@renderer/lib/api/products";
import { syncNow } from "@renderer/lib/sync/sync-status";
import { commitLocalChange, isDeviceBound } from "@renderer/lib/local-db/local-write";

export function ProductFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [brands, setBrands] = useState<Brand[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [brandId, setBrandId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [productType, setProductType] = useState<ProductType>("STOCK_ITEM");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<EntityStatus>("active");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEdit);

  useEffect(() => {
    void brandsApi
      .list({ status: "active" })
      .then(setBrands)
      .catch(() => undefined);
    void categoriesApi
      .list({ status: "active" })
      .then(setCategories)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    void productsApi
      .get(id)
      .then((p) => {
        if (cancelled) return;
        setName(p.name);
        setBrandId(p.brandId ?? "");
        setCategoryId(p.categoryId ?? "");
        setProductType(p.productType);
        setDescription(p.description);
        setStatus(p.status);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(getApiErrorMessage(err, "Failed to load product"));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Product name is required");
      return;
    }
    if (!brandId) {
      setError("Brand is required");
      return;
    }
    if (!categoryId) {
      setError("Category is required");
      return;
    }
    setSaving(true);
    setError(null);

    const body = {
      name: name.trim(),
      brandId,
      categoryId,
      productType,
      description: description.trim(),
      status,
    };

    if (await isDeviceBound()) {
      try {
        const localId = isEdit && id ? id : crypto.randomUUID();
        const local = {
          id: localId,
          name: name.trim(),
          productCode: isEdit ? "" : `LOCAL-${localId.slice(0, 8)}`,
          brandId,
          brandName: brands.find((b) => b.id === brandId)?.name ?? "",
          categoryId,
          categoryName: categories.find((c) => c.id === categoryId)?.name ?? "",
          productType,
          description: description.trim(),
          imagePath: null,
          status,
          totalOnHand: 0,
          totalReserved: 0,
          totalAvailable: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await commitLocalChange({
          entityType: "product",
          entityId: localId,
          operation: status === "inactive" ? "DELETE" : "UPSERT",
          payload: local,
        });
        void syncNow();
        setSaving(false);
        navigate(`/products/${localId}`);
        return;
      } catch (err: unknown) {
        setSaving(false);
        setError(getApiErrorMessage(err, "Failed to save product locally"));
        return;
      }
    }

    let saved;
    try {
      saved = isEdit
        ? await productsApi.update(id!, body)
        : await productsApi.create(body);
    } catch (err: unknown) {
      if (!isEdit && err instanceof TypeError && window.blackbox?.sync) {
        const localId = crypto.randomUUID();
        const local = {
          id: localId,
          name: name.trim(),
          productCode: `LOCAL-${localId.slice(0, 8)}`,
          brandId,
          brandName: "",
          categoryId,
          categoryName: "",
          productType,
          description: description.trim(),
          imagePath: null,
          status,
          totalOnHand: 0,
          totalReserved: 0,
          totalAvailable: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        try {
          await window.blackbox.localDb?.upsertProduct(local);
          await window.blackbox.sync.enqueue({
            stream: "master_data",
            entityType: "product",
            entityId: localId,
            operation: "UPSERT",
            payload: local,
            baseEntityVersion: 0,
          });
          setSaving(false);
          navigate(`/products/${localId}`);
          return;
        } catch {
          /* fall through */
        }
      }
      setSaving(false);
      setError(getApiErrorMessage(err, "Failed to save product"));
      return;
    }

    let localCacheWarning = false;
    try {
      await window.blackbox?.localDb?.upsertProduct(saved);
    } catch {
      localCacheWarning = true;
    }

    setSaving(false);
    navigate(`/products/${saved.id}`, {
      state: localCacheWarning ? { cacheWarning: true } : undefined,
    });
  }

  if (loading) {
    return <p className="text-muted-foreground text-sm">Loading…</p>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {isEdit ? "Edit Product" : "Add Product"}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Basic product details. Add SKUs from the product profile after saving.
        </p>
      </div>

      {error ? (
        <div
          role="alert"
          className="border-destructive/40 bg-destructive/5 text-destructive rounded-lg border px-4 py-3 text-sm"
        >
          {error}
        </div>
      ) : null}

      <form onSubmit={onSubmit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="type">Product type</Label>
            <select
              id="type"
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              value={productType}
              onChange={(e) => setProductType(e.target.value as ProductType)}
            >
              {PRODUCT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {PRODUCT_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="status">Status</Label>
            <select
              id="status"
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              value={status}
              onChange={(e) => setStatus(e.target.value as EntityStatus)}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="brand">Brand *</Label>
            <select
              id="brand"
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              value={brandId}
              onChange={(e) => setBrandId(e.target.value)}
              required
            >
              <option value="">Select brand…</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="category">Category *</Label>
            <select
              id="category"
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              required
            >
              <option value="">Select category…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <div className="flex gap-3">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Create product"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate(isEdit ? `/products/${id}` : "/products")}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
