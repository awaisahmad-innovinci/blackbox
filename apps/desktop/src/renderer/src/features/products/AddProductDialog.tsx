import { useCallback, useEffect, useRef, useState } from "react";
import type { Brand, Category, ProductDetail, ProductType } from "@blackbox/shared";
import { PRODUCT_TYPES, PRODUCT_TYPE_LABELS } from "@blackbox/shared";
import {
  normalizeOptionalStoredText,
  normalizeStoredText,
} from "@blackbox/shared";
import {
  FORM_DIALOG_FIELD_FULL,
  FORM_DIALOG_GRID,
} from "@renderer/lib/form-layout";
import {
  FormEnterNav,
  formSelectPickerProps,
} from "@renderer/components/form-enter-nav";
import { FormSelectWithAction } from "@renderer/components/form-select-with-action";
import { handleDialogOpenChange } from "@renderer/lib/on-dialog-open-change";
import { Button } from "@blackbox/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@blackbox/ui/dialog";
import { Input } from "@blackbox/ui/input";
import { Label } from "@blackbox/ui/label";
import { Textarea } from "@blackbox/ui/textarea";
import { getApiErrorMessage } from "@renderer/lib/api/client";
import { productsApi } from "@renderer/lib/api/products";
import { loadBrands, loadCategories } from "@renderer/lib/local-db/entity-source";
import { commitLocalChange, isDeviceBound } from "@renderer/lib/local-db/local-write";
import { syncNow } from "@renderer/lib/sync/sync-status";
import { AddTaxonomyDialog } from "@renderer/features/taxonomy/AddTaxonomyDialog";
import type { TaxonomyKind } from "@renderer/features/taxonomy/create-taxonomy";
import {
  type TaxonomyCreatedDetail,
  useTaxonomyCreatedListener,
} from "@renderer/lib/taxonomy-created-sync";

function emptyForm() {
  return {
    name: "",
    brandId: "",
    categoryId: "",
    productType: "STOCK_ITEM" as ProductType,
    description: "",
  };
}

export function AddProductDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (product: ProductDetail, cacheWarning: boolean) => void;
}) {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [taxonomyDialog, setTaxonomyDialog] = useState<{
    kind: TaxonomyKind;
    returnFocusTo: string;
  } | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  function onTaxonomyCreated(row: Brand | Category) {
    if (taxonomyDialog?.kind === "brand") {
      setBrands((prev) =>
        prev.some((b) => b.id === row.id) ? prev : [...prev, row as Brand],
      );
      setForm((prev) => ({ ...prev, brandId: row.id }));
    } else if (taxonomyDialog?.kind === "category") {
      setCategories((prev) =>
        prev.some((c) => c.id === row.id) ? prev : [...prev, row as Category],
      );
      setForm((prev) => ({ ...prev, categoryId: row.id }));
    }
    setTaxonomyDialog(null);
  }

  const handleGlobalTaxonomyCreated = useCallback(
    ({ kind, row }: TaxonomyCreatedDetail) => {
      if (kind === "brand") {
        setBrands((prev) =>
          prev.some((b) => b.id === row.id) ? prev : [...prev, row as Brand],
        );
        setForm((prev) => ({ ...prev, brandId: row.id }));
      } else if (kind === "category") {
        setCategories((prev) =>
          prev.some((c) => c.id === row.id) ? prev : [...prev, row as Category],
        );
        setForm((prev) => ({ ...prev, categoryId: row.id }));
      }
    },
    [],
  );

  useTaxonomyCreatedListener(handleGlobalTaxonomyCreated);

  useEffect(() => {
    if (!open) return;
    setForm(emptyForm());
    setError(null);
    void loadBrands("active")
      .then(setBrands)
      .catch(() => undefined);
    void loadCategories("active")
      .then(setCategories)
      .catch(() => undefined);
    requestAnimationFrame(() => nameRef.current?.focus());
  }, [open]);

  async function onSave() {
    if (!form.name.trim()) {
      setError("Product name is required");
      return;
    }
    if (!form.brandId) {
      setError("Brand is required");
      return;
    }
    if (!form.categoryId) {
      setError("Category is required");
      return;
    }

    setSaving(true);
    setError(null);

    const body = {
      name: normalizeStoredText(form.name),
      brandId: form.brandId,
      categoryId: form.categoryId,
      productType: form.productType,
      description: normalizeOptionalStoredText(form.description),
      status: "active" as const,
    };

    if (await isDeviceBound()) {
      try {
        const localId = crypto.randomUUID();
        const local: ProductDetail = {
          id: localId,
          name: body.name,
          productCode: `LOCAL-${localId.slice(0, 8)}`,
          brandId: body.brandId,
          brandName: brands.find((b) => b.id === body.brandId)?.name ?? "",
          categoryId: body.categoryId,
          categoryName:
            categories.find((c) => c.id === body.categoryId)?.name ?? "",
          productType: body.productType,
          description: body.description,
          imagePath: null,
          status: "active",
          totalOnHand: 0,
          totalReserved: 0,
          totalAvailable: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await commitLocalChange({
          entityType: "product",
          entityId: localId,
          operation: "UPSERT",
          payload: local as unknown as Record<string, unknown>,
        });
        void syncNow();
        setSaving(false);
        setForm(emptyForm());
        onCreated(local, false);
        return;
      } catch (err: unknown) {
        setSaving(false);
        setError(getApiErrorMessage(err, "Failed to save product locally"));
        return;
      }
    }

    let saved: ProductDetail;
    try {
      saved = await productsApi.create(body);
    } catch (err: unknown) {
      if (err instanceof TypeError && window.blackbox?.sync) {
        const localId = crypto.randomUUID();
        const local: ProductDetail = {
          id: localId,
          name: body.name,
          productCode: `LOCAL-${localId.slice(0, 8)}`,
          brandId: body.brandId,
          brandName: "",
          categoryId: body.categoryId,
          categoryName: "",
          productType: body.productType,
          description: body.description,
          imagePath: null,
          status: "active",
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
            payload: local as unknown as Record<string, unknown>,
            baseEntityVersion: 0,
          });
          setSaving(false);
          setForm(emptyForm());
          onCreated(local, false);
          return;
        } catch {
          /* fall through */
        }
      }
      setSaving(false);
      setError(getApiErrorMessage(err, "Failed to save product"));
      return;
    }

    let cacheWarning = false;
    try {
      await window.blackbox?.localDb?.upsertProduct(saved);
    } catch {
      cacheWarning = true;
    }

    setSaving(false);
    setForm(emptyForm());
    onCreated(saved, cacheWarning);
  }

  return (
    <>
    <Dialog
      open={open}
      onOpenChange={(next) => {
        handleDialogOpenChange(
          next,
          () => {
            setForm(emptyForm());
            setError(null);
            onClose();
          },
          !saving,
        );
      }}
    >
      <DialogContent className="fixed top-1/2 left-1/2 max-h-[85vh] w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Product</DialogTitle>
        </DialogHeader>

        <p className="text-muted-foreground text-sm">
          Add a new product, then continue to create a SKU linked to this vendor.
        </p>

        {error ? (
          <div className="border-destructive/40 bg-destructive/5 text-destructive rounded-md border px-3 py-2 text-sm">
            {error}
          </div>
        ) : null}

        <FormEnterNav className={FORM_DIALOG_GRID}>
          <div className={`space-y-1.5 ${FORM_DIALOG_FIELD_FULL}`}>
            <Label htmlFor="product-name">Name *</Label>
            <Input
              ref={nameRef}
              id="product-name"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              onBlur={(e) =>
                setForm((prev) => ({
                  ...prev,
                  name: normalizeStoredText(e.target.value),
                }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="product-type">Product type</Label>
            <select
              id="product-type"
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              {...formSelectPickerProps()}
              value={form.productType}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  productType: e.target.value as ProductType,
                }))
              }
            >
              {PRODUCT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {PRODUCT_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <FormSelectWithAction
            id="product-brand"
            label="Brand *"
            actionLabel="+ New brand"
            onAction={() =>
              setTaxonomyDialog({
                kind: "brand",
                returnFocusTo: "product-brand",
              })
            }
            {...formSelectPickerProps()}
            value={form.brandId}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, brandId: e.target.value }))
            }
          >
            <option value="">Select brand…</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </FormSelectWithAction>
          <FormSelectWithAction
            id="product-category"
            label="Category *"
            actionLabel="+ New category"
            onAction={() =>
              setTaxonomyDialog({
                kind: "category",
                returnFocusTo: "product-category",
              })
            }
            {...formSelectPickerProps()}
            value={form.categoryId}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, categoryId: e.target.value }))
            }
          >
            <option value="">Select category…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </FormSelectWithAction>
          <div className={`space-y-1.5 ${FORM_DIALOG_FIELD_FULL}`}>
            <Label htmlFor="product-description">Description</Label>
            <Textarea
              id="product-description"
              value={form.description}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, description: e.target.value }))
              }
              onBlur={(e) =>
                setForm((prev) => ({
                  ...prev,
                  description: normalizeOptionalStoredText(e.target.value),
                }))
              }
              rows={3}
            />
          </div>
        </FormEnterNav>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => {
              setForm(emptyForm());
              setError(null);
              onClose();
            }}
          >
            Cancel
          </Button>
          <Button type="button" disabled={saving} onClick={() => void onSave()}>
            {saving ? "Saving…" : "Create product"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

      {taxonomyDialog ? (
        <AddTaxonomyDialog
          open
          kind={taxonomyDialog.kind}
          returnFocusTo={taxonomyDialog.returnFocusTo}
          onClose={() => setTaxonomyDialog(null)}
          onCreated={onTaxonomyCreated}
        />
      ) : null}
    </>
  );
}
