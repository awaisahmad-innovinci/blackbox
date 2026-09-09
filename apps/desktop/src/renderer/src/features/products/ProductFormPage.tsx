import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { Brand, Category, EntityStatus, ProductType } from "@blackbox/shared";
import { PRODUCT_TYPES, PRODUCT_TYPE_LABELS } from "@blackbox/shared";
import {
  normalizeOptionalStoredText,
  normalizeStoredText,
} from "@blackbox/shared";
import { FORM_FIELD_FULL, FORM_GRID } from "@renderer/lib/form-layout";
import {
  FormEnterNav,
  formSelectPickerProps,
} from "@renderer/components/form-enter-nav";
import { FormSelectWithAction } from "@renderer/components/form-select-with-action";
import { Button } from "@blackbox/ui/button";
import { Input } from "@blackbox/ui/input";
import { Label } from "@blackbox/ui/label";
import { Textarea } from "@blackbox/ui/textarea";
import { getApiErrorMessage } from "@renderer/lib/api/client";
import { productsApi } from "@renderer/lib/api/products";
import {
  loadBrands,
  loadCategories,
  loadProduct,
} from "@renderer/lib/local-db/entity-source";
import { syncNow } from "@renderer/lib/sync/sync-status";
import { commitLocalChange, isDeviceBound } from "@renderer/lib/local-db/local-write";
import {
  KEYBOARD_HINT_ENTER,
  KEYBOARD_HINT_SAVE,
  KeyboardHints,
} from "@renderer/components/keyboard-hints";
import { usePageKeyboard } from "@renderer/lib/use-page-keyboard";
import { AddTaxonomyDialog } from "@renderer/features/taxonomy/AddTaxonomyDialog";
import type { TaxonomyKind } from "@renderer/features/taxonomy/create-taxonomy";

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
  const [createTaxonomyKind, setCreateTaxonomyKind] =
    useState<TaxonomyKind | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function onTaxonomyCreated(row: Brand | Category) {
    if (createTaxonomyKind === "brand") {
      setBrands((prev) =>
        prev.some((b) => b.id === row.id) ? prev : [...prev, row as Brand],
      );
      setBrandId(row.id);
    } else if (createTaxonomyKind === "category") {
      setCategories((prev) =>
        prev.some((c) => c.id === row.id) ? prev : [...prev, row as Category],
      );
      setCategoryId(row.id);
    }
    setCreateTaxonomyKind(null);
  }

  usePageKeyboard({
    onSave: () => formRef.current?.requestSubmit(),
  });

  useEffect(() => {
    void loadBrands("active")
      .then(setBrands)
      .catch(() => undefined);
    void loadCategories("active")
      .then(setCategories)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    void loadProduct(id)
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

    const normalizedName = normalizeStoredText(name);
    const normalizedDescription = normalizeOptionalStoredText(description);
    const body = {
      name: normalizedName,
      brandId,
      categoryId,
      productType,
      description: normalizedDescription,
      status,
    };

    if (await isDeviceBound()) {
      try {
        const localId = isEdit && id ? id : crypto.randomUUID();
        const local = {
          id: localId,
          name: normalizedName,
          productCode: isEdit ? "" : `LOCAL-${localId.slice(0, 8)}`,
          brandId,
          brandName: brands.find((b) => b.id === brandId)?.name ?? "",
          categoryId,
          categoryName: categories.find((c) => c.id === categoryId)?.name ?? "",
          productType,
          description: normalizedDescription,
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
        navigate(`/products/${localId}`, {
          state: { product: local },
          replace: true,
        });
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
          name: normalizedName,
          productCode: `LOCAL-${localId.slice(0, 8)}`,
          brandId,
          brandName: "",
          categoryId,
          categoryName: "",
          productType,
          description: normalizedDescription,
          imagePath: null,
          status,
          totalOnHand: 0,
          totalReserved: 0,
          totalAvailable: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        try {
          await commitLocalChange({
            entityType: "product",
            entityId: localId,
            operation: status === "inactive" ? "DELETE" : "UPSERT",
            payload: local,
          });
          void syncNow();
          setSaving(false);
          navigate(`/products/${localId}`, {
            state: { product: local },
            replace: true,
          });
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
      state: {
        product: saved,
        cacheWarning: localCacheWarning ? true : undefined,
      },
      replace: true,
    });
  }

  if (loading) {
    return <p className="text-muted-foreground text-sm">Loading…</p>;
  }

  return (
    <div className="space-y-6">
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

      <form ref={formRef} onSubmit={onSubmit} className="space-y-5">
        <FormEnterNav className={FORM_GRID}>
          <div className={`space-y-1.5 ${FORM_FIELD_FULL}`}>
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={(e) => setName(normalizeStoredText(e.target.value))}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="type">Product type</Label>
            <select
              id="type"
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              {...formSelectPickerProps()}
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
              {...formSelectPickerProps()}
              value={status}
              onChange={(e) => setStatus(e.target.value as EntityStatus)}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <FormSelectWithAction
            id="brand"
            label="Brand *"
            actionLabel="+ New brand"
            onAction={() => setCreateTaxonomyKind("brand")}
            {...formSelectPickerProps()}
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
          </FormSelectWithAction>
          <FormSelectWithAction
            id="category"
            label="Category *"
            actionLabel="+ New category"
            onAction={() => setCreateTaxonomyKind("category")}
            {...formSelectPickerProps()}
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
          </FormSelectWithAction>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={(e) =>
                setDescription(normalizeOptionalStoredText(e.target.value))
              }
              rows={3}
            />
          </div>
        </FormEnterNav>

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

      <KeyboardHints hints={[KEYBOARD_HINT_ENTER, KEYBOARD_HINT_SAVE]} />

      {createTaxonomyKind ? (
        <AddTaxonomyDialog
          open
          kind={createTaxonomyKind}
          onClose={() => setCreateTaxonomyKind(null)}
          onCreated={onTaxonomyCreated}
        />
      ) : null}
    </div>
  );
}
