import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import type { ProductDetail, ProductListItem, VendorDetail, VendorSku } from "@blackbox/shared";
import { PAYMENT_TERMS_LABELS } from "@blackbox/shared";
import { Button } from "@blackbox/ui/button";
import { BackButton } from "@renderer/app/BackButton";
import { ListTableLink, ListTableRow } from "@renderer/components/list-table-row";
import { ApiError } from "@renderer/lib/api/client";
import { loadVendorProfile } from "@renderer/lib/local-db/entity-source";
import { AddProductDialog } from "@renderer/features/products/AddProductDialog";
import { AddProductSkuDialog } from "@renderer/features/products/AddProductSkuDialog";
import { AddVendorSkuDialog } from "./AddVendorSkuDialog";

function contactBlock(
  detail: VendorDetail,
  type: "PRIMARY" | "OTHER" | "MANAGER" | "SALESPERSON",
  label: string,
) {
  const c = detail.contacts.find((x) => x.contactType === type);
  return (
    <div className="space-y-1">
      <h3 className="text-sm font-medium">{label}</h3>
      <p className="text-sm">{c?.name || "—"}</p>
      <p className="text-muted-foreground text-sm">{c?.phone || "—"}</p>
      <p className="text-muted-foreground text-sm">{c?.email || "—"}</p>
    </div>
  );
}

export function VendorProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const flash = (location.state as { flash?: string; vendor?: VendorDetail } | null)
    ?.flash;
  const seeded = (
    location.state as { vendor?: VendorDetail } | null
  )?.vendor;
  const [vendor, setVendor] = useState<VendorDetail | null>(seeded ?? null);
  const [skus, setSkus] = useState<VendorSku[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(flash ?? null);
  const [addSkuOpen, setAddSkuOpen] = useState(false);
  const [createProductOpen, setCreateProductOpen] = useState(false);
  const [createSkuProduct, setCreateSkuProduct] =
    useState<ProductListItem | null>(null);
  const createSkuFromNewProductRef = useRef(false);

  function productDetailToListItem(product: ProductDetail): ProductListItem {
    return {
      id: product.id,
      name: product.name,
      productCode: product.productCode,
      brandId: product.brandId,
      brandName: product.brandName,
      categoryId: product.categoryId,
      categoryName: product.categoryName,
      productType: product.productType,
      status: product.status,
      skuCount: 0,
      totalAvailable: 0,
      supplierCount: 0,
    };
  }

  function onVendorSkuAdded(row: VendorSku, cacheWarning: boolean) {
    setSkus((prev) => (prev.some((s) => s.id === row.id) ? prev : [...prev, row]));
    if (cacheWarning) {
      setMessage("SKU saved; local cache update failed.");
    }
  }

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      const data = await loadVendorProfile(id);
      setVendor(data.vendor);
      setSkus(data.skus);
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : "Failed to load vendor");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error && !vendor) {
    return (
      <div
        role="alert"
        className="border-destructive/40 bg-destructive/5 text-destructive rounded-lg border px-4 py-3 text-sm"
      >
        {error}
      </div>
    );
  }

  if (!vendor) {
    return <p className="text-muted-foreground text-sm">Loading…</p>;
  }

  return (
    <div className="space-y-8">
      {message ? (
        <div className="border-border bg-muted/40 rounded-lg border px-4 py-3 text-sm">
          {message}
          <button
            type="button"
            className="text-muted-foreground ml-3 underline"
            onClick={() => setMessage(null)}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <BackButton />
          <h1 className="mt-2 text-2xl font-semibold tracking-tight uppercase">
            {vendor.name}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">{vendor.vendorCode}</p>
          <p className="mt-2 text-sm capitalize">
            Status: <span className="font-medium">{vendor.status}</span>
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate(`/vendors/${vendor.id}/edit`)}>
          Edit
        </Button>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Overview</h2>
        <dl className="grid gap-3 sm:grid-cols-2 text-sm">
          <div>
            <dt className="text-muted-foreground">Vendor Name</dt>
            <dd className="font-medium">{vendor.name}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Vendor Code</dt>
            <dd className="font-medium">{vendor.vendorCode}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Group</dt>
            <dd className="font-medium">{vendor.groupName ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Status</dt>
            <dd className="font-medium capitalize">{vendor.status}</dd>
          </div>
        </dl>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Contacts</h2>
        <div className="grid gap-6 sm:grid-cols-2">
          {contactBlock(vendor, "PRIMARY", "Primary Contact")}
          {contactBlock(vendor, "OTHER", "Other Contact")}
          {contactBlock(vendor, "MANAGER", "Manager")}
          {contactBlock(vendor, "SALESPERSON", "Salesperson")}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Address</h2>
        <dl className="grid gap-3 sm:grid-cols-2 text-sm">
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">Address</dt>
            <dd className="whitespace-pre-wrap font-medium">
              {vendor.address || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">City</dt>
            <dd className="font-medium">{vendor.city || "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">State / Province</dt>
            <dd className="font-medium">{vendor.state || "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Country</dt>
            <dd className="font-medium">{vendor.country || "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Postal Code</dt>
            <dd className="font-medium">{vendor.postalCode || "—"}</dd>
          </div>
        </dl>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Commercial Information</h2>
        <dl className="grid gap-3 sm:grid-cols-2 text-sm">
          <div>
            <dt className="text-muted-foreground">Sales Target</dt>
            <dd className="font-medium tabular-nums">
              {vendor.salesTarget ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Credit Limit</dt>
            <dd className="font-medium tabular-nums">
              {vendor.creditLimit ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Payment Terms</dt>
            <dd className="font-medium">
              {vendor.paymentTerms
                ? PAYMENT_TERMS_LABELS[vendor.paymentTerms]
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Tax Number</dt>
            <dd className="font-medium">{vendor.taxNumber || "—"}</dd>
          </div>
        </dl>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-medium">Supplied SKUs</h2>
          <Button size="sm" onClick={() => setAddSkuOpen(true)}>
            + Add SKU
          </Button>
        </div>
        <div className="border-border overflow-hidden rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">Variant</th>
                <th className="px-4 py-3 font-medium">SKU</th>
                <th className="px-4 py-3 font-medium">Cost</th>
                <th className="px-4 py-3 font-medium">MOQ</th>
              </tr>
            </thead>
            <tbody>
              {skus.length === 0 ? (
                <tr className="border-border border-t">
                  <td
                    colSpan={5}
                    className="text-muted-foreground px-4 py-6 text-center"
                  >
                    No SKUs linked yet.
                  </td>
                </tr>
              ) : (
                skus.map((row) => (
                  <ListTableRow
                    key={row.id}
                    onActivate={() => navigate(`/skus/${row.productSkuId}`)}
                  >
                    <td className="px-4 py-3">
                      <ListTableLink
                        to={`/skus/${row.productSkuId}`}
                        className="text-primary hover:underline"
                      >
                        {row.productName}
                      </ListTableLink>
                    </td>
                    <td className="px-4 py-3">{row.variantName || "—"}</td>
                    <td className="px-4 py-3">{row.sku}</td>
                    <td className="px-4 py-3 tabular-nums">{row.purchasePrice}</td>
                    <td className="px-4 py-3 tabular-nums">
                      {row.minimumOrderQuantity}
                    </td>
                  </ListTableRow>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Purchase Orders</h2>
        <p className="text-muted-foreground text-sm">Coming in a later phase.</p>
      </section>

      <AddVendorSkuDialog
        open={addSkuOpen && !createSkuProduct && !createProductOpen}
        vendor={vendor}
        existingProductSkuIds={skus.map((s) => s.productSkuId)}
        onClose={() => setAddSkuOpen(false)}
        onLinked={(row, cacheWarning) => {
          setAddSkuOpen(false);
          onVendorSkuAdded(row, cacheWarning);
          if (!cacheWarning) {
            setMessage("SKU linked to vendor.");
          }
        }}
        onStartCreateProduct={(product) => {
          createSkuFromNewProductRef.current = false;
          setCreateSkuProduct(product);
        }}
        onStartCreateNewProduct={() => setCreateProductOpen(true)}
      />

      <AddProductDialog
        open={createProductOpen}
        onClose={() => setCreateProductOpen(false)}
        onCreated={(product, cacheWarning) => {
          setCreateProductOpen(false);
          createSkuFromNewProductRef.current = true;
          setCreateSkuProduct(productDetailToListItem(product));
          if (cacheWarning) {
            setMessage("Product saved; local cache update failed.");
          }
        }}
      />

      {createSkuProduct ? (
        <AddProductSkuDialog
          open
          productId={createSkuProduct.id}
          productName={createSkuProduct.name}
          linkToVendor={vendor}
          onClose={() => setCreateSkuProduct(null)}
          onCreated={() => {}}
          onVendorSkuLinked={(row, cacheWarning) => {
            const fromNewProduct = createSkuFromNewProductRef.current;
            createSkuFromNewProductRef.current = false;
            setCreateSkuProduct(null);
            setAddSkuOpen(false);
            onVendorSkuAdded(row, cacheWarning);
            setMessage(
              cacheWarning
                ? fromNewProduct
                  ? "Product and SKU created and linked; local cache update failed."
                  : "SKU created and linked; local cache update failed."
                : fromNewProduct
                  ? "Product and SKU created and linked to vendor."
                  : "SKU created and linked to vendor.",
            );
          }}
        />
      ) : null}
    </div>
  );
}
