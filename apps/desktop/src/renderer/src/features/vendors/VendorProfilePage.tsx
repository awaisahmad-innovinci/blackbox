import { useCallback, useEffect, useRef, useState } from "react";
import { formatMoney } from "@blackbox/shared";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import type {
  ProductDetail,
  ProductListItem,
  VendorDetail,
  VendorLedger,
  VendorSku,
} from "@blackbox/shared";
import { PAYMENT_TERMS_LABELS, roundMoney4 } from "@blackbox/shared";
import { Button } from "@blackbox/ui/button";
import { Input } from "@blackbox/ui/input";
import { Label } from "@blackbox/ui/label";
import { BackButton } from "@renderer/app/BackButton";
import { ListTableLink, ListTableRow } from "@renderer/components/list-table-row";
import { ApiError, getApiErrorMessage } from "@renderer/lib/api/client";
import { vendorsApi } from "@renderer/lib/api/vendors";
import { loadVendorLedger, loadVendorProfile } from "@renderer/lib/local-db/entity-source";
import { commitLocalChange, isDeviceBound } from "@renderer/lib/local-db/local-write";
import { syncNow } from "@renderer/lib/sync/sync-status";
import { useConfirm } from "@renderer/components/confirm-provider";
import { canAccessPurchasingModule } from "@renderer/lib/sales-access";
import { useSession } from "@renderer/lib/session/context";
import { AddProductDialog } from "@renderer/features/products/AddProductDialog";
import { AddProductSkuDialog } from "@renderer/features/products/AddProductSkuDialog";
import { AddVendorSkuDialog } from "./AddVendorSkuDialog";
import {
  VendorPaymentReceipt,
  type VendorPaymentReceiptData,
} from "./VendorPaymentReceipt";

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
  const confirm = useConfirm();
  const location = useLocation();
  const flash = (location.state as { flash?: string; vendor?: VendorDetail } | null)
    ?.flash;
  const seeded = (
    location.state as { vendor?: VendorDetail } | null
  )?.vendor;
  const { user } = useSession();
  const canRecordPayment = canAccessPurchasingModule(user?.permissions ?? []);
  const [vendor, setVendor] = useState<VendorDetail | null>(seeded ?? null);
  const [ledger, setLedger] = useState<VendorLedger | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [paying, setPaying] = useState(false);
  const [paymentReceipt, setPaymentReceipt] =
    useState<VendorPaymentReceiptData | null>(null);
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

  async function recordPayment() {
    if (!id) return;
    const amount = roundMoney4(Number(paymentAmount));
    if (!(amount > 0)) {
      setError("Payment amount must be greater than zero");
      return;
    }
    if (ledger && amount > ledger.credit) {
      setError(`Payment cannot exceed vendor credit (${ledger.credit})`);
      return;
    }
    const note = paymentNote.trim();
    const occurredAt = new Date().toISOString();
    const creditBefore = ledger?.credit;
    setPaying(true);
    setError(null);
    try {
      if (await isDeviceBound()) {
        const entryId = crypto.randomUUID();
        await commitLocalChange({
          entityType: "vendor_ledger_entry",
          entityId: entryId,
          operation: "UPSERT",
          payload: {
            id: entryId,
            vendorId: id,
            entryType: "PAYMENT",
            amount,
            goodsReceiptId: null,
            receiptNumber: null,
            note,
            occurredAt,
            createdAt: occurredAt,
            updatedAt: occurredAt,
          },
        });
      } else {
        await vendorsApi.recordPayment(id, {
          amount,
          note: note || undefined,
        });
      }
      setPaymentAmount("");
      setPaymentNote("");
      let creditRemaining =
        creditBefore == null
          ? undefined
          : roundMoney4(Math.max(0, creditBefore - amount));
      try {
        const next = await loadVendorLedger(id);
        setLedger(next);
        creditRemaining = next.credit;
      } catch {
        /* payment is saved; the receipt uses the computed remainder */
      }
      setPaymentReceipt({
        vendorName: vendor?.name ?? "Vendor",
        amount,
        note,
        occurredAt,
        paidBy: user?.fullName || user?.username || "",
        creditRemaining,
      });
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Failed to record payment"));
    } finally {
      setPaying(false);
    }
  }

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      const data = await loadVendorProfile(id);
      setVendor(data.vendor);
      setSkus(data.skus);
      setLedger(await loadVendorLedger(id));
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : "Failed to load vendor");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onDelete() {
    if (!id || !vendor) return;
    const ok = await confirm({
      title: "Delete vendor?",
      description: `${vendor.name} will be hidden from lists and pickers. Past purchase orders and payments keep it, and you can restore it from the Deleted filter.`,
      confirmLabel: "Delete",
    });
    if (!ok) return;
    setError(null);
    try {
      if (await isDeviceBound()) {
        const now = new Date().toISOString();
        await commitLocalChange({
          entityType: "vendor",
          entityId: id,
          operation: "DELETE",
          payload: {
            ...vendor,
            status: "inactive",
            deletedAt: now,
            updatedAt: now,
          } as unknown as Record<string, unknown>,
        });
        void syncNow();
        navigate("/vendors");
        return;
      }
      const updated = await vendorsApi.delete(id);
      try {
        await window.blackbox?.localDb?.upsertVendor(updated);
      } catch {
        /* optional cache */
      }
      navigate("/vendors");
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Failed to delete vendor"));
    }
  }

  async function onRestore() {
    if (!id || !vendor) return;
    setError(null);
    try {
      if (await isDeviceBound()) {
        const updated: VendorDetail = {
          ...vendor,
          status: "inactive",
          deletedAt: null,
          updatedAt: new Date().toISOString(),
        };
        await commitLocalChange({
          entityType: "vendor",
          entityId: id,
          operation: "UPSERT",
          payload: updated as unknown as Record<string, unknown>,
        });
        void syncNow();
        setVendor(updated);
        return;
      }
      const updated = await vendorsApi.restore(id);
      try {
        await window.blackbox?.localDb?.upsertVendor(updated);
      } catch {
        /* optional cache */
      }
      setVendor(updated);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Failed to restore vendor"));
    }
  }

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

  if (paymentReceipt) {
    return (
      <VendorPaymentReceipt
        receipt={paymentReceipt}
        onDone={() => setPaymentReceipt(null)}
      />
    );
  }

  return (
    <div className="space-y-8">
      {error ? (
        <div
          role="alert"
          className="border-destructive/40 bg-destructive/5 text-destructive rounded-lg border px-4 py-3 text-sm"
        >
          {error}
        </div>
      ) : null}
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
          <BackButton to="/vendors" />
          <h1 className="mt-2 text-2xl font-semibold tracking-tight uppercase">
            {vendor.name}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">{vendor.vendorCode}</p>
          <p className="mt-2 text-sm capitalize">
            Status:{" "}
            <span className="font-medium">
              {vendor.deletedAt ? "deleted" : vendor.status}
            </span>
          </p>
        </div>
        {vendor.deletedAt ? (
          <Button variant="outline" onClick={() => void onRestore()}>
            Restore
          </Button>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => navigate(`/vendors/${vendor.id}/edit`)}
            >
              Edit
            </Button>
            <Button variant="destructive" onClick={() => void onDelete()}>
              Delete
            </Button>
          </div>
        )}
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
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-medium">Ledger</h2>
            <p className="text-muted-foreground text-sm">
              Vendor credit:{" "}
              <span className="text-foreground tabular-nums">
                {formatMoney((ledger?.credit ?? 0))}
              </span>
            </p>
          </div>
          {canRecordPayment ? (
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void recordPayment();
              }}
            >
              <div className="space-y-1">
                <Label htmlFor="vendor-payment-amount">Amount</Label>
                <Input
                  id="vendor-payment-amount"
                  className="h-8 w-28"
                  inputMode="decimal"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="vendor-payment-note">Note</Label>
                <Input
                  id="vendor-payment-note"
                  className="h-8 w-48"
                  value={paymentNote}
                  onChange={(e) => setPaymentNote(e.target.value)}
                />
              </div>
              <Button type="submit" size="sm" disabled={paying}>
                {paying ? "Recording…" : "Record payment"}
              </Button>
            </form>
          ) : null}
        </div>
        <div className="border-border overflow-hidden rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Receipt</th>
                <th className="px-4 py-3 font-medium">Note</th>
              </tr>
            </thead>
            <tbody>
              {(ledger?.entries.length ?? 0) === 0 ? (
                <tr className="border-border border-t">
                  <td
                    colSpan={5}
                    className="text-muted-foreground px-4 py-6 text-center"
                  >
                    No ledger entries yet.
                  </td>
                </tr>
              ) : (
                ledger?.entries.map((entry) => (
                  <tr key={entry.id} className="border-border border-t">
                    <td className="px-4 py-3">
                      {new Date(entry.occurredAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      {entry.entryType === "CHARGE" ? "Charge" : "Payment"}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {formatMoney(entry.amount)}
                    </td>
                    <td className="px-4 py-3">{entry.receiptNumber || "—"}</td>
                    <td className="px-4 py-3">{entry.note || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
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
                    <td className="px-4 py-3 tabular-nums">{formatMoney(row.purchasePrice)}</td>
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
