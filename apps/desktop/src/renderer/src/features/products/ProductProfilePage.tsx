import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import type {
  ProductDetail,
  ProductSkuDetail,
  ProductSupplierRow,
  StockMovementRow,
  WarehouseStockRow,
} from "@blackbox/shared";
import { PRODUCT_TYPE_LABELS } from "@blackbox/shared";
import { Button } from "@blackbox/ui/button";
import { BackButton } from "@renderer/app/BackButton";
import { ListTableLink, ListTableRow } from "@renderer/components/list-table-row";
import { getApiErrorMessage } from "@renderer/lib/api/client";
import { productsApi } from "@renderer/lib/api/products";
import { loadProductProfile } from "@renderer/lib/local-db/entity-source";
import {
  commitLocalChange,
  isDeviceBound,
} from "@renderer/lib/local-db/local-write";
import { syncNow } from "@renderer/lib/sync/sync-status";
import { SupplierPriceCells } from "@renderer/features/inventory/supplier-price-cells";
import { AddProductSkuDialog } from "./AddProductSkuDialog";
import { AddProductSupplierDialog } from "./AddProductSupplierDialog";

export function ProductProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const seeded = (
    location.state as { product?: ProductDetail } | null
  )?.product;
  const [product, setProduct] = useState<ProductDetail | null>(seeded ?? null);
  const [skus, setSkus] = useState<ProductSkuDetail[]>([]);
  const [suppliers, setSuppliers] = useState<ProductSupplierRow[]>([]);
  const [inventory, setInventory] = useState<WarehouseStockRow[]>([]);
  const [movements, setMovements] = useState<StockMovementRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [skuOpen, setSkuOpen] = useState(false);
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [lockedSupplierSkuId, setLockedSupplierSkuId] = useState<string | null>(
    null,
  );
  const [needsSupplierSkuIds, setNeedsSupplierSkuIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!id) return;
    const data = await loadProductProfile(id);
    setProduct(data.product);
    setSkus(data.skus);
    setSuppliers(data.suppliers);
    setInventory(data.inventory);
    setMovements(data.movements);
    const linked = new Set(data.suppliers.map((s) => s.productSkuId));
    setNeedsSupplierSkuIds((prev) => prev.filter((skuId) => !linked.has(skuId)));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void reload().catch((err: unknown) => {
      if (!cancelled) {
        setError(getApiErrorMessage(err, "Failed to load product"));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [id, reload]);

  async function onDeactivate() {
    if (!id || !product) return;
    if (!window.confirm(`Deactivate ${product.name}?`)) return;
    setBusy(true);
    setError(null);
    try {
      if (await isDeviceBound()) {
        const now = new Date().toISOString();
        const updated: ProductDetail = {
          ...product,
          status: "inactive",
          updatedAt: now,
        };
        await commitLocalChange({
          entityType: "product",
          entityId: id,
          operation: "DELETE",
          payload: updated as unknown as Record<string, unknown>,
        });
        void syncNow();
        setProduct(updated);
        return;
      }
      const updated = await productsApi.deactivate(id);
      setProduct(updated);
      try {
        await window.blackbox?.localDb?.upsertProduct(updated);
      } catch {
        setNotice("Saved on server; local cache update failed.");
      }
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Failed to deactivate"));
    } finally {
      setBusy(false);
    }
  }

  async function onActivate() {
    if (!id || !product) return;
    if (!product.brandId || !product.categoryId) {
      setError("Cannot activate product without brand and category.");
      return;
    }
    if (!window.confirm(`Activate ${product.name}?`)) return;
    setBusy(true);
    setError(null);
    try {
      if (await isDeviceBound()) {
        const now = new Date().toISOString();
        const updated: ProductDetail = {
          ...product,
          status: "active",
          updatedAt: now,
        };
        await commitLocalChange({
          entityType: "product",
          entityId: id,
          operation: "UPSERT",
          payload: updated as unknown as Record<string, unknown>,
        });
        void syncNow();
        setProduct(updated);
        return;
      }
      const updated = await productsApi.update(id, {
        name: product.name,
        brandId: product.brandId,
        categoryId: product.categoryId,
        productType: product.productType,
        description: product.description,
        status: "active",
      });
      setProduct(updated);
      try {
        await window.blackbox?.localDb?.upsertProduct(updated);
      } catch {
        setNotice("Saved on server; local cache update failed.");
      }
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Failed to activate"));
    } finally {
      setBusy(false);
    }
  }

  if (error && !product) {
    return (
      <div
        role="alert"
        className="border-destructive/40 bg-destructive/5 text-destructive rounded-lg border px-4 py-3 text-sm"
      >
        {error}
      </div>
    );
  }

  if (!product) {
    return <p className="text-muted-foreground text-sm">Loading…</p>;
  }

  const skusMissingSupplier = new Set([
    ...needsSupplierSkuIds,
    ...skus
      .filter(
        (s) =>
          s.status === "active" &&
          !suppliers.some((sup) => sup.productSkuId === s.id),
      )
      .map((s) => s.id),
  ]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <BackButton to="/products" />
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            {product.name}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {PRODUCT_TYPE_LABELS[product.productType]} ·{" "}
            <span className="capitalize">{product.status}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => navigate(`/products/${product.id}/edit`)}
          >
            Edit
          </Button>
          <Button onClick={() => setSkuOpen(true)}>+ Add SKU</Button>
          {product.status === "active" ? (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void onDeactivate()}
            >
              Deactivate
            </Button>
          ) : (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void onActivate()}
            >
              Activate
            </Button>
          )}
        </div>
      </div>

      {notice ? (
        <div className="border-border bg-muted/40 rounded-lg border px-4 py-3 text-sm">
          {notice}
        </div>
      ) : null}
      {error ? (
        <div
          role="alert"
          className="border-destructive/40 bg-destructive/5 text-destructive rounded-lg border px-4 py-3 text-sm"
        >
          {error}
        </div>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Overview</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Brand</dt>
            <dd className="font-medium">{product.brandName || "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Category</dt>
            <dd className="font-medium">{product.categoryName || "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">On hand</dt>
            <dd className="font-medium tabular-nums">{product.totalOnHand}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Reserved</dt>
            <dd className="font-medium tabular-nums">{product.totalReserved}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Available</dt>
            <dd className="font-medium tabular-nums">
              {product.totalAvailable}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">Description</dt>
            <dd className="font-medium">{product.description || "—"}</dd>
          </div>
        </dl>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">SKUs</h2>
        <div className="border-border overflow-hidden rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Variant</th>
                <th className="px-4 py-3 font-medium">SKU</th>
                <th className="px-4 py-3 font-medium">Barcode</th>
                <th className="px-4 py-3 font-medium">Cost</th>
                <th className="px-4 py-3 font-medium">Selling</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {skus.length === 0 ? (
                <tr className="border-border border-t">
                  <td
                    colSpan={6}
                    className="text-muted-foreground px-4 py-6 text-center"
                  >
                    No SKUs yet. Add one to continue.
                  </td>
                </tr>
              ) : (
                skus.map((s) => (
                  <ListTableRow
                    key={s.id}
                    onActivate={() => navigate(`/skus/${s.id}`)}
                  >
                    <td className="px-4 py-3">
                      <ListTableLink
                        to={`/skus/${s.id}`}
                        className="text-primary hover:underline"
                      >
                        {s.variantName || "—"}
                      </ListTableLink>
                      {skusMissingSupplier.has(s.id) ? (
                        <div className="text-amber-700 dark:text-amber-400 mt-1 text-xs">
                          Needs supplier
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">{s.sku}</td>
                    <td className="px-4 py-3">{s.barcode || "—"}</td>
                    <td className="px-4 py-3 tabular-nums">{s.costPrice}</td>
                    <td className="px-4 py-3 tabular-nums">{s.sellingPrice}</td>
                    <td className="px-4 py-3 capitalize">{s.status}</td>
                  </ListTableRow>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-medium">Suppliers</h2>
          <Button
            size="sm"
            variant="outline"
            disabled={skus.length === 0}
            onClick={() => {
              setLockedSupplierSkuId(null);
              setSupplierOpen(true);
            }}
          >
            + Add Supplier
          </Button>
        </div>
        <div className="border-border overflow-hidden rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Vendor</th>
                <th className="px-4 py-3 font-medium">SKU</th>
                <th className="px-4 py-3 font-medium">Price/pc</th>
                <th className="px-4 py-3 font-medium">Price/box</th>
                <th className="px-4 py-3 font-medium">MOQ</th>
                <th className="px-4 py-3 font-medium">Lead</th>
                <th className="px-4 py-3 font-medium">Preferred</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.length === 0 ? (
                <tr className="border-border border-t">
                  <td
                    colSpan={7}
                    className="text-muted-foreground px-4 py-6 text-center"
                  >
                    No suppliers linked.
                  </td>
                </tr>
              ) : (
                suppliers.map((s) => (
                  <ListTableRow
                    key={s.vendorSkuId}
                    onActivate={() => navigate(`/vendors/${s.vendorId}`)}
                  >
                    <td className="px-4 py-3">
                      <ListTableLink
                        to={`/vendors/${s.vendorId}`}
                        className="text-primary hover:underline"
                      >
                        {s.vendorName}
                      </ListTableLink>
                    </td>
                    <td className="px-4 py-3">
                      {s.variantName} · {s.sku}
                    </td>
                    <SupplierPriceCells
                      purchasePrice={s.purchasePrice}
                      unitsPerPurchaseUnit={s.unitsPerPurchaseUnit}
                    />
                    <td className="px-4 py-3 tabular-nums">
                      {s.minimumOrderQuantity}
                    </td>
                    <td className="px-4 py-3">{s.leadTimeDays}d</td>
                    <td className="px-4 py-3">{s.isPreferred ? "Yes" : "No"}</td>
                  </ListTableRow>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Inventory</h2>
        <div className="border-border overflow-hidden rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Warehouse</th>
                <th className="px-4 py-3 font-medium">SKU</th>
                <th className="px-4 py-3 font-medium">On hand</th>
                <th className="px-4 py-3 font-medium">Reserved</th>
                <th className="px-4 py-3 font-medium">Available</th>
              </tr>
            </thead>
            <tbody>
              {inventory.length === 0 ? (
                <tr className="border-border border-t">
                  <td
                    colSpan={5}
                    className="text-muted-foreground px-4 py-6 text-center"
                  >
                    No stock lines.
                  </td>
                </tr>
              ) : (
                inventory.map((row) => (
                  <ListTableRow
                    key={`${row.warehouseId}-${row.productSkuId}`}
                  >
                    <td className="px-4 py-3">{row.warehouseName}</td>
                    <td className="px-4 py-3">
                      {row.variantName} · {row.sku}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {row.quantityOnHand}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {row.quantityReserved}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {row.quantityAvailable}
                    </td>
                  </ListTableRow>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Stock history</h2>
        <div className="border-border overflow-hidden rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">SKU</th>
                <th className="px-4 py-3 font-medium">Warehouse</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Qty</th>
                <th className="px-4 py-3 font-medium">Reason</th>
              </tr>
            </thead>
            <tbody>
              {movements.length === 0 ? (
                <tr className="border-border border-t">
                  <td
                    colSpan={6}
                    className="text-muted-foreground px-4 py-6 text-center"
                  >
                    No movements yet.
                  </td>
                </tr>
              ) : (
                movements.map((m) => (
                  <ListTableRow key={m.id}>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {new Date(m.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      {m.variantName} · {m.sku}
                    </td>
                    <td className="px-4 py-3">{m.warehouseName}</td>
                    <td className="px-4 py-3">{m.movementType}</td>
                    <td className="px-4 py-3 tabular-nums">{m.quantity}</td>
                    <td className="px-4 py-3">{m.reason || "—"}</td>
                  </ListTableRow>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <AddProductSkuDialog
        open={skuOpen}
        productId={product.id}
        productName={product.name}
        onClose={() => setSkuOpen(false)}
        onCreated={(row, cacheWarning) => {
          setSkuOpen(false);
          setSkus((prev) =>
            prev.some((s) => s.id === row.id) ? prev : [...prev, row],
          );
          setLockedSupplierSkuId(row.id);
          setNeedsSupplierSkuIds((prev) =>
            prev.includes(row.id) ? prev : [...prev, row.id],
          );
          setSupplierOpen(true);
          setNotice(
            cacheWarning
              ? "SKU saved on server; local cache update failed. Add a supplier to finish setup."
              : "SKU created. Add a supplier to finish setup.",
          );
        }}
      />
      <AddProductSupplierDialog
        open={supplierOpen}
        skus={
          lockedSupplierSkuId
            ? skus.filter((s) => s.id === lockedSupplierSkuId)
            : skus.filter((s) => s.status === "active")
        }
        lockedSkuId={lockedSupplierSkuId}
        existingSuppliers={suppliers}
        onClose={() => {
          if (lockedSupplierSkuId) {
            setNeedsSupplierSkuIds((prev) =>
              prev.includes(lockedSupplierSkuId)
                ? prev
                : [...prev, lockedSupplierSkuId],
            );
            setNotice(
              "SKU still needs a supplier. Use Add Supplier to link a vendor.",
            );
          }
          setLockedSupplierSkuId(null);
          setSupplierOpen(false);
        }}
        onCreated={(_row, cacheWarning) => {
          const finishedSkuId = lockedSupplierSkuId;
          setSupplierOpen(false);
          setLockedSupplierSkuId(null);
          if (finishedSkuId) {
            setNeedsSupplierSkuIds((prev) =>
              prev.filter((id) => id !== finishedSkuId),
            );
          }
          if (cacheWarning) {
            setNotice("Supplier link saved; local cache update failed.");
          } else {
            setNotice(null);
          }
          void reload();
        }}
      />
    </div>
  );
}
