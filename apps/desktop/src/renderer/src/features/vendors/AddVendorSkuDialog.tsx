import { useEffect, useRef, useState } from "react";
import type {
  ProductListItem,
  ProductSkuDetail,
  SkuSearchResult,
  VendorDetail,
  VendorSku,
} from "@blackbox/shared";
import { FORM_GRID_TIGHT } from "@renderer/lib/form-layout";
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
import { getApiErrorMessage } from "@renderer/lib/api/client";
import { loadProducts, loadSkuProfile, loadSkuSearch } from "@renderer/lib/local-db/entity-source";
import { barcodeScanInputProps, useBarcodeScanTarget } from "@renderer/lib/barcode-scan";
import { createVendorSkuLink } from "./create-vendor-sku-link";

type Tab = "link" | "create";

export function AddVendorSkuDialog({
  open,
  vendor,
  existingProductSkuIds,
  onClose,
  onLinked,
  onStartCreateProduct,
  onStartCreateNewProduct,
}: {
  open: boolean;
  vendor: VendorDetail;
  existingProductSkuIds: string[];
  onClose: () => void;
  onLinked: (row: VendorSku, cacheWarning: boolean) => void;
  onStartCreateProduct: (product: ProductListItem) => void;
  onStartCreateNewProduct: () => void;
}) {
  const [tab, setTab] = useState<Tab>("link");
  const [skuQuery, setSkuQuery] = useState("");
  const [skuResults, setSkuResults] = useState<SkuSearchResult[]>([]);
  const [selectedSearch, setSelectedSearch] = useState<SkuSearchResult | null>(
    null,
  );
  const [selectedSku, setSelectedSku] = useState<ProductSkuDetail | null>(null);
  const [productQuery, setProductQuery] = useState("");
  const [productResults, setProductResults] = useState<ProductListItem[]>([]);
  const [moq, setMoq] = useState("1");
  const [leadTimeDays, setLeadTimeDays] = useState("0");
  const [isPreferred, setIsPreferred] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const skuQueryRef = useRef<HTMLInputElement>(null);

  useBarcodeScanTarget({
    kind: "search",
    layer: "dialog",
    enabled: open && tab === "link" && !selectedSearch,
    inputRef: skuQueryRef,
    onScan: setSkuQuery,
  });

  function reset() {
    setTab("link");
    setSkuQuery("");
    setSkuResults([]);
    setSelectedSearch(null);
    setSelectedSku(null);
    setProductQuery("");
    setProductResults([]);
    setMoq("1");
    setLeadTimeDays("0");
    setIsPreferred(false);
    setError(null);
  }

  useEffect(() => {
    if (!open || tab !== "link" || selectedSearch) return;
    const t = setTimeout(() => {
      void loadSkuSearch(skuQuery)
        .then(setSkuResults)
        .catch(() => setSkuResults([]));
    }, 200);
    return () => clearTimeout(t);
  }, [skuQuery, open, tab, selectedSearch]);

  useEffect(() => {
    if (!open || tab !== "create") return;
    const t = setTimeout(() => {
      void loadProducts({
        search: productQuery.trim() || undefined,
        status: "active",
        pageSize: 50,
      })
        .then((res) =>
          setProductResults(res.items.filter((p) => p.status === "active")),
        )
        .catch(() => setProductResults([]));
    }, 200);
    return () => clearTimeout(t);
  }, [productQuery, open, tab]);

  useEffect(() => {
    if (!selectedSearch) {
      setSelectedSku(null);
      return;
    }
    let cancelled = false;
    void loadSkuProfile(selectedSearch.id)
      .then((data) => {
        if (!cancelled) setSelectedSku(data.sku);
      })
      .catch(() => {
        if (!cancelled) {
          setSelectedSku(null);
          setError("Failed to load SKU details");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedSearch]);

  async function onSaveLink() {
    if (!selectedSearch || !selectedSku) {
      setError("Select a SKU first");
      return;
    }
    if (existingProductSkuIds.includes(selectedSearch.id)) {
      setError("This SKU is already linked to the vendor");
      return;
    }
    const minimumOrderQuantity = Number(moq);
    if (Number.isNaN(minimumOrderQuantity) || minimumOrderQuantity < 0) {
      setError("Minimum order quantity must be a non-negative number");
      return;
    }
    const leadTime = Number(leadTimeDays);
    if (!Number.isInteger(leadTime) || leadTime < 0) {
      setError("Lead time must be a non-negative whole number");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const { row, cacheWarning } = await createVendorSkuLink({
        vendorId: vendor.id,
        productName: selectedSearch.productName,
        sku: selectedSku,
        minimumOrderQuantity,
        leadTimeDays: leadTime,
        isPreferred,
      });
      setSaving(false);
      reset();
      onLinked(row, cacheWarning);
    } catch (err: unknown) {
      setSaving(false);
      setError(getApiErrorMessage(err, "Failed to link SKU"));
    }
  }

  const purchasePrice =
    selectedSku != null
      ? (selectedSku.costPrice ?? 0) *
        (selectedSku.unitsPerPurchaseUnit > 0
          ? selectedSku.unitsPerPurchaseUnit
          : 1)
      : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !saving) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className="fixed top-1/2 left-1/2 max-h-[85vh] w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add SKU</DialogTitle>
        </DialogHeader>

        <div className="bg-muted/40 rounded-md px-3 py-2 text-sm">
          <div className="font-medium">{vendor.name}</div>
          <div className="text-muted-foreground">{vendor.vendorCode}</div>
        </div>

        <div className="flex gap-2 border-b pb-2">
          <Button
            type="button"
            size="sm"
            variant={tab === "link" ? "default" : "outline"}
            onClick={() => {
              setTab("link");
              setError(null);
            }}
          >
            Link existing
          </Button>
          <Button
            type="button"
            size="sm"
            variant={tab === "create" ? "default" : "outline"}
            onClick={() => {
              setTab("create");
              setError(null);
            }}
          >
            Create new
          </Button>
        </div>

        {error ? (
          <div className="border-destructive/40 bg-destructive/5 text-destructive rounded-md border px-3 py-2 text-sm">
            {error}
          </div>
        ) : null}

        {tab === "link" ? (
          <div className="space-y-3">
            {!selectedSearch ? (
              <>
                <div className="space-y-1.5">
                  <Label>Search SKU</Label>
                  <Input
                    ref={skuQueryRef}
                    value={skuQuery}
                    onChange={(e) => setSkuQuery(e.target.value)}
                    placeholder="Product, variant, SKU, or barcode"
                    {...barcodeScanInputProps}
                  />
                </div>
                <ul className="border-border max-h-48 divide-y overflow-y-auto rounded-md border">
                  {skuResults.map((row) => {
                    const linked = existingProductSkuIds.includes(row.id);
                    return (
                      <li key={row.id}>
                        <button
                          type="button"
                          disabled={linked}
                          className="hover:bg-muted/50 disabled:text-muted-foreground w-full px-3 py-2 text-left text-sm disabled:cursor-not-allowed"
                          onClick={() => {
                            setSelectedSearch(row);
                            setError(null);
                          }}
                        >
                          <div className="font-medium">{row.productName}</div>
                          <div className="text-muted-foreground">
                            {row.variantName || "—"} · {row.sku}
                            {linked ? " · already linked" : ""}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : (
              <>
                <div className="bg-muted/40 flex items-center justify-between rounded-md px-3 py-2 text-sm">
                  <div>
                    <div className="font-medium">{selectedSearch.productName}</div>
                    <div className="text-muted-foreground">
                      {selectedSearch.variantName || "—"} · {selectedSearch.sku}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedSearch(null);
                      setSelectedSku(null);
                    }}
                  >
                    Change
                  </Button>
                </div>
                {selectedSku ? (
                  <div className={FORM_GRID_TIGHT}>
                    <div className="space-y-1.5">
                      <Label>
                        Purchase price
                        {selectedSku.purchaseUnitName
                          ? ` (per ${selectedSku.purchaseUnitName})`
                          : ""}
                      </Label>
                      <Input
                        value={
                          purchasePrice != null ? String(purchasePrice) : "—"
                        }
                        disabled
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Purchase unit</Label>
                      <Input
                        value={selectedSku.purchaseUnitName || "—"}
                        disabled
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>MOQ</Label>
                      <Input
                        value={moq}
                        onChange={(e) => setMoq(e.target.value)}
                        autoFocus
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Lead time (days)</Label>
                      <Input
                        value={leadTimeDays}
                        onChange={(e) => setLeadTimeDays(e.target.value)}
                      />
                    </div>
                    <label className="flex items-center gap-2 text-sm sm:col-span-2">
                      <input
                        type="checkbox"
                        checked={isPreferred}
                        onChange={(e) => setIsPreferred(e.target.checked)}
                      />
                      Preferred supplier
                    </label>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">Loading SKU…</p>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-muted-foreground text-sm">
              Pick an existing product or create a new one, then add a SKU linked
              to this vendor automatically.
            </p>
            <div className="space-y-1.5">
              <Label>Search product</Label>
              <Input
                value={productQuery}
                onChange={(e) => setProductQuery(e.target.value)}
                placeholder="Product name"
                autoFocus
              />
            </div>
            <ul className="border-border max-h-48 divide-y overflow-y-auto rounded-md border">
              {productResults.length === 0 ? (
                <li className="text-muted-foreground px-3 py-4 text-center text-sm">
                  No products found — create a new one below.
                </li>
              ) : (
                productResults.map((product) => (
                  <li key={product.id}>
                    <button
                      type="button"
                      className="hover:bg-muted/50 w-full px-3 py-2 text-left text-sm"
                      onClick={() => {
                        reset();
                        onStartCreateProduct(product);
                      }}
                    >
                      <div className="font-medium">{product.name}</div>
                      <div className="text-muted-foreground">
                        {product.brandName || "—"} · {product.categoryName || "—"}
                      </div>
                    </button>
                  </li>
                ))
              )}
            </ul>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => onStartCreateNewProduct()}
            >
              + Create new product
            </Button>
          </div>
        )}

        {tab === "link" ? (
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => {
                reset();
                onClose();
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={saving || !selectedSku}
              onClick={() => void onSaveLink()}
            >
              {saving ? "Saving…" : "Link SKU"}
            </Button>
          </DialogFooter>
        ) : (
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => {
              reset();
              onClose();
            }}>
              Cancel
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
