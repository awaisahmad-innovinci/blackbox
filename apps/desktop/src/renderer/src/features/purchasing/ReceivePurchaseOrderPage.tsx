import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type {
  GoodsReceiptDetail,
  GoodsReceiptReturnAdjustment,
  PendingVendorReturnLine,
  PurchaseOrderDetail,
  ReceivingDraft,
  ReceivingLineDraft,
  VendorReturnSettlement,
  VendorSku,
} from "@blackbox/shared";
import {
  buildReceivedAtIso,
  landedUnitByQuantity,
  lineTotalAfterDiscount,
  roundMoney4,
  VENDOR_RETURN_REASON_LABELS,
} from "@blackbox/shared";
import { Button } from "@blackbox/ui/button";
import { Input } from "@blackbox/ui/input";
import { Label } from "@blackbox/ui/label";
import { Textarea } from "@blackbox/ui/textarea";
import { PrintButton } from "@renderer/components/print-button";
import { PrintDocument } from "@renderer/components/print-document";
import { getApiErrorMessage } from "@renderer/lib/api/client";
import { goodsReceiptsApi } from "@renderer/lib/api/goods-receipts";
import { purchaseOrdersApi } from "@renderer/lib/api/purchase-orders";
import { syncNow } from "@renderer/lib/sync/sync-status";
import { commitLocalChange, isDeviceBound } from "@renderer/lib/local-db/local-write";
import { loadPendingVendorReturns, loadPurchaseOrder, loadReceivingDraft, loadVendorReturn } from "@renderer/lib/local-db/entity-source";
import { allocateReceiptNumber } from "@renderer/lib/document-numbers";
import { useSession } from "@renderer/lib/session/context";
import { UpdateVendorSkuPriceDialog } from "./UpdateVendorSkuPriceDialog";

type DraftLine = ReceivingLineDraft & {
  receiveQuantity: number;
  bonusQuantity: number;
  receivingUnitCost: number;
  discountPercent: number;
  originalPoUnitCost: number;
  originalSellingPrice: number;
};

function costChanged(line: DraftLine): boolean {
  return line.receivingUnitCost !== line.originalPoUnitCost;
}

function saleChanged(line: DraftLine): boolean {
  return line.currentSellingPrice !== line.originalSellingPrice;
}

function pricesChanged(line: DraftLine): boolean {
  return costChanged(line) || saleChanged(line);
}

async function buildReceivedPurchaseOrderPayload(
  id: string,
  header: Omit<ReceivingDraft, "items">,
  lines: DraftLine[],
): Promise<Record<string, unknown>> {
  const headerOnly = {
    id,
    poNumber: header.poNumber,
    vendorId: header.vendorId,
    vendorName: header.vendorName,
    warehouseId: header.warehouseId,
    warehouseName: header.warehouseName,
    status: "RECEIVED" as const,
  };
  try {
    const po = await loadPurchaseOrder(id);
    const items = po.items.map((item) => {
      const line = lines.find((l) => l.purchaseOrderItemId === item.id);
      if (!line) return item;
      const unitCost = line.receivingUnitCost;
      const lineTotal = roundMoney4(
        item.quantity * unitCost - item.discount + item.tax,
      );
      return { ...item, unitCost, lineTotal };
    });
    const subtotal = roundMoney4(
      items.reduce((sum, item) => sum + item.lineTotal, 0),
    );
    const total = roundMoney4(
      subtotal - po.discount + po.tax + po.otherCharges,
    );
    const updated: PurchaseOrderDetail = {
      ...po,
      status: "RECEIVED",
      items,
      subtotal,
      total,
    };
    return updated as unknown as Record<string, unknown>;
  } catch {
    return headerOnly;
  }
}

async function persistReceivePriceChangesLocal(
  header: Omit<ReceivingDraft, "items">,
  lines: DraftLine[],
  skuIdsWithProductUpsert: Set<string>,
): Promise<void> {
  for (const line of lines) {
    if (line.vendorSkuId && costChanged(line)) {
      const existing = await window.blackbox?.localDb?.getVendorSku(
        line.vendorSkuId,
      );
      const row: VendorSku = {
        id: line.vendorSkuId,
        vendorId: header.vendorId,
        productSkuId: line.productSkuId,
        vendorSkuCode: line.vendorSkuCode,
        purchasePrice: line.receivingUnitCost,
        purchaseUnitId: line.purchaseUnitId,
        purchaseUnitName: line.purchaseUnitName,
        unitsPerPurchaseUnit: line.unitsPerPurchaseUnit,
        minimumOrderQuantity: existing?.minimumOrderQuantity ?? 1,
        leadTimeDays: existing?.leadTimeDays ?? 0,
        isPreferred: existing?.isPreferred ?? false,
        status: existing?.status ?? "active",
        notes: existing?.notes ?? "",
        productName: existing?.productName || line.productName,
        variantName: existing?.variantName || line.variantName,
        sku: existing?.sku || line.sku,
        barcode: existing?.barcode ?? null,
      };
      await commitLocalChange({
        entityType: "vendor_sku",
        entityId: line.vendorSkuId,
        operation: "UPSERT",
        payload: { ...existing, ...row } as unknown as Record<string, unknown>,
      });
    }
    if (
      saleChanged(line) &&
      !skuIdsWithProductUpsert.has(line.productSkuId)
    ) {
      const sku = await window.blackbox?.localDb?.getSku(line.productSkuId);
      if (!sku) continue;
      await commitLocalChange({
        entityType: "product_sku",
        entityId: line.productSkuId,
        operation: "UPSERT",
        payload: {
          ...sku,
          sellingPrice: line.currentSellingPrice,
        },
      });
    }
  }
}

type ReturnSettlementChoice = "" | VendorReturnSettlement;

function buildReturnAdjustments(
  pending: PendingVendorReturnLine[],
  settlements: Record<string, ReturnSettlementChoice>,
): GoodsReceiptReturnAdjustment[] {
  return pending
    .map((line) => {
      const settlement = settlements[line.vendorReturnItemId] ?? "";
      if (settlement !== "CASHBACK" && settlement !== "REPLACE") return null;
      return {
        vendorReturnItemId: line.vendorReturnItemId,
        settlement,
      };
    })
    .filter((row): row is GoodsReceiptReturnAdjustment => row != null);
}

async function persistReturnSettlementsLocal(
  receiptId: string,
  receiptNumber: string,
  warehouseId: string,
  warehouseName: string,
  pending: PendingVendorReturnLine[],
  settlements: Record<string, ReturnSettlementChoice>,
  now: string,
): Promise<void> {
  const touchedReturnIds = new Set<string>();

  for (const line of pending) {
    const choice = settlements[line.vendorReturnItemId] ?? "";
    if (choice !== "CASHBACK" && choice !== "REPLACE") continue;
    touchedReturnIds.add(line.vendorReturnId);

    if (choice !== "REPLACE") continue;
    const unitsPer =
      line.unitsPerPurchaseUnit > 0 ? line.unitsPerPurchaseUnit : 1;
    const stockDelta = line.quantity * unitsPer;
    if (!(stockDelta > 0)) continue;
    const movementId = crypto.randomUUID();
    const avg = await window.blackbox?.localDb?.applyPurchaseAvgCost(
      line.productSkuId,
      stockDelta,
      line.unitCost,
      line.unitsPerPurchaseUnit,
    );
    if (avg) {
      await commitLocalChange({
        entityType: "product_sku",
        entityId: line.productSkuId,
        operation: "UPSERT",
        payload: {
          ...avg.sku,
          costPrice: avg.avgCost,
        },
      });
    }
    await commitLocalChange({
      entityType: "inventory_movement",
      entityId: movementId,
      operation: "EVENT",
      payload: {
        id: movementId,
        productSkuId: line.productSkuId,
        sku: line.sku,
        variantName: line.variantName,
        warehouseId,
        warehouseName,
        movementType: "PURCHASE_RECEIPT",
        quantity: stockDelta,
        delta: stockDelta,
        referenceType: "goods_receipt",
        referenceId: receiptId,
        reason: `Replace ${receiptNumber}`,
        createdAt: now,
      },
    });
  }

  for (const returnId of touchedReturnIds) {
    const detail = await loadVendorReturn(returnId);
    const updatedItems = detail.items.map((item) => {
      const choice = settlements[item.id] ?? "";
      if (choice !== "CASHBACK" && choice !== "REPLACE") return item;
      return {
        ...item,
        settlement: choice,
        goodsReceiptId: receiptId,
      };
    });
    const allSettled = updatedItems.every((item) => item.settlement != null);
    await commitLocalChange({
      entityType: "vendor_return",
      entityId: returnId,
      operation: "UPSERT",
      payload: {
        ...detail,
        items: updatedItems,
        status: allSettled ? "SETTLED" : detail.status,
        updatedAt: now,
      } as unknown as Record<string, unknown>,
    });
  }
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ReceivePurchaseOrderPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useSession();

  const [header, setHeader] = useState<Omit<ReceivingDraft, "items"> | null>(
    null,
  );
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [receiptDate, setReceiptDate] = useState(todayIso());
  const [voucherNumber, setVoucherNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [discount, setDiscount] = useState("0");
  const [tax, setTax] = useState("0");
  const [otherCharges, setOtherCharges] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<GoodsReceiptDetail | null>(null);

  const [priceEdit, setPriceEdit] = useState<{
    productLabel: string;
    currentPrice: number;
    currentSellingPrice: number;
    purchaseOrderItemId: string;
    purchaseUnitName: string | null;
    unitsPerPurchaseUnit: number;
  } | null>(null);

  const [pendingReturns, setPendingReturns] = useState<
    PendingVendorReturnLine[]
  >([]);
  const [returnSettlements, setReturnSettlements] = useState<
    Record<string, ReturnSettlementChoice>
  >({});

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    void loadReceivingDraft(id)
      .then((draft) => {
        if (cancelled) return;
        const { items, ...rest } = draft;
        setHeader(rest);
        setLines(
          items.map((item) => ({
            ...item,
            receiveQuantity: 0,
            bonusQuantity: 0,
            receivingUnitCost: item.poUnitCost,
            discountPercent: 0,
            originalPoUnitCost: item.poUnitCost,
            originalSellingPrice: item.currentSellingPrice,
          })),
        );
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(getApiErrorMessage(err, "Failed to load receiving form"));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!header?.vendorId) {
      setPendingReturns([]);
      return;
    }
    let cancelled = false;
    void loadPendingVendorReturns(header.vendorId)
      .then((rows) => {
        if (!cancelled) setPendingReturns(rows);
      })
      .catch(() => {
        if (!cancelled) setPendingReturns([]);
      });
    return () => {
      cancelled = true;
    };
  }, [header?.vendorId]);

  const subtotal = useMemo(
    () =>
      Math.round(
        lines.reduce(
          (sum, l) =>
            sum +
            lineTotalAfterDiscount(
              l.receiveQuantity,
              l.receivingUnitCost,
              l.discountPercent,
            ),
          0,
        ) * 10000,
      ) / 10000,
    [lines],
  );
  const totalReceiveQty = useMemo(
    () => lines.reduce((sum, line) => sum + line.receiveQuantity, 0),
    [lines],
  );
  const discountPct = Number(discount) || 0;
  const discountAmount =
    Math.round(((subtotal * discountPct) / 100) * 10000) / 10000;
  const taxN = Number(tax) || 0;
  const otherN = Number(otherCharges) || 0;
  const returnCredit = useMemo(
    () =>
      roundMoney4(
        pendingReturns.reduce((sum, line) => {
          if (returnSettlements[line.vendorReturnItemId] !== "CASHBACK") {
            return sum;
          }
          return sum + line.lineTotal;
        }, 0),
      ),
    [pendingReturns, returnSettlements],
  );
  const grandTotal = Math.max(
    0,
    roundMoney4(subtotal - discountAmount + taxN + otherN - returnCredit),
  );
  const returnAdjustments = useMemo(
    () => buildReturnAdjustments(pendingReturns, returnSettlements),
    [pendingReturns, returnSettlements],
  );

  function updateLine(
    purchaseOrderItemId: string,
    patch: Partial<
      Pick<DraftLine, "receiveQuantity" | "bonusQuantity" | "discountPercent">
    >,
  ) {
    setLines((prev) =>
      prev.map((l) =>
        l.purchaseOrderItemId === purchaseOrderItemId ? { ...l, ...patch } : l,
      ),
    );
  }

  async function onConfirm() {
    if (!id || !header) return;
    for (const line of lines) {
      if (line.receiveQuantity < 0) {
        setError("Received quantity must be >= 0");
        return;
      }
      if (line.receiveQuantity > line.orderedQuantity) {
        setError(
          "Received quantity cannot be greater than ordered quantity.",
        );
        return;
      }
      if (line.bonusQuantity < 0) {
        setError("Bonus / sample quantity must be >= 0");
        return;
      }
      if (line.receivingUnitCost < 0) {
        setError("Receiving unit cost must be >= 0");
        return;
      }
      if (line.discountPercent < 0 || line.discountPercent > 100) {
        setError("Line discount % must be between 0 and 100");
        return;
      }
    }
    if (discountPct < 0 || discountPct > 100) {
      setError("Discount % must be between 0 and 100");
      return;
    }
    if (totalReceiveQty <= 0) {
      setError("You cannot receive with 0 quantity.");
      return;
    }

    const ok = window.confirm(
      `Confirm Receiving Voucher?\n\nPO: ${header.poNumber}\nVendor: ${header.vendorName}\nWarehouse: ${header.warehouseName}\nItems: ${lines.length}\nDiscount: ${discountPct}% (${discountAmount.toLocaleString()})\nReturn credit: ${returnCredit.toLocaleString()}\nTotal: ${grandTotal.toLocaleString()}`,
    );
    if (!ok) return;

    setSaving(true);
    setError(null);
    try {
      if (await isDeviceBound()) {
        const localId = crypto.randomUUID();
        const now = new Date().toISOString();
        const receiptNumber = await allocateReceiptNumber(user?.tenantName ?? "");
        const receipt: GoodsReceiptDetail = {
          id: localId,
          receiptNumber,
          purchaseOrderId: id,
          poNumber: header.poNumber,
          vendorId: header.vendorId,
          vendorName: header.vendorName,
          warehouseId: header.warehouseId,
          warehouseName: header.warehouseName,
          status: "POSTED",
          receivedAt: buildReceivedAtIso(receiptDate),
          voucherNumber: voucherNumber.trim() || null,
          subtotal,
          discount: discountAmount,
          tax: taxN,
          otherCharges: otherN,
          returnCredit,
          total: grandTotal,
          notes: notes.trim(),
          items: lines.map((l) => ({
            id: crypto.randomUUID(),
            purchaseOrderItemId: l.purchaseOrderItemId,
            productSkuId: l.productSkuId,
            vendorSkuId: l.vendorSkuId,
            productName: l.productName,
            variantName: l.variantName,
            sku: l.sku,
            vendorSkuCode: l.vendorSkuCode,
            purchaseUnitId: l.purchaseUnitId,
            purchaseUnitName: l.purchaseUnitName,
            unitsPerPurchaseUnit: l.unitsPerPurchaseUnit,
            orderedQuantity: l.orderedQuantity,
            receivedQuantity: l.receiveQuantity,
            bonusQuantity: l.bonusQuantity,
            poUnitCost: l.poUnitCost,
            receivingUnitCost: l.receivingUnitCost,
            discountPercent: l.discountPercent,
            lineTotal: lineTotalAfterDiscount(
              l.receiveQuantity,
              l.receivingUnitCost,
              l.discountPercent,
            ),
          })),
          createdAt: now,
          updatedAt: now,
        };
        await commitLocalChange({
          entityType: "goods_receipt",
          entityId: localId,
          operation: "UPSERT",
          payload: {
            ...(receipt as unknown as Record<string, unknown>),
            returnAdjustments,
          },
        });
        const poPayload = await buildReceivedPurchaseOrderPayload(
          id,
          header,
          lines,
        );
        await commitLocalChange({
          entityType: "purchase_order",
          entityId: id,
          operation: "UPSERT",
          payload: poPayload,
        });
        const totalReceivedQty = lines.reduce(
          (sum, l) => sum + (l.receiveQuantity > 0 ? l.receiveQuantity : 0),
          0,
        );
        const skuIdsWithProductUpsert = new Set<string>();
        for (const line of lines) {
          const unitsPer =
            line.unitsPerPurchaseUnit > 0 ? line.unitsPerPurchaseUnit : 1;
          const billedDelta = line.receiveQuantity * unitsPer;
          const stockDelta =
            (line.receiveQuantity + line.bonusQuantity) * unitsPer;
          if (!(stockDelta > 0)) continue;
          const movementId = crypto.randomUUID();
          if (billedDelta > 0) {
            const netUnit = landedUnitByQuantity(
              line.receiveQuantity,
              line.receivingUnitCost,
              line.discountPercent,
              totalReceivedQty,
              discountAmount,
              taxN,
              otherN,
            );
            const avg = await window.blackbox?.localDb?.applyPurchaseAvgCost(
              line.productSkuId,
              billedDelta,
              netUnit,
              line.unitsPerPurchaseUnit,
            );
            if (avg) {
              await commitLocalChange({
                entityType: "product_sku",
                entityId: line.productSkuId,
                operation: "UPSERT",
                payload: {
                  ...avg.sku,
                  costPrice: avg.avgCost,
                  sellingPrice: line.currentSellingPrice,
                },
              });
              skuIdsWithProductUpsert.add(line.productSkuId);
            }
          }
          await commitLocalChange({
            entityType: "inventory_movement",
            entityId: movementId,
            operation: "EVENT",
            payload: {
              id: movementId,
              productSkuId: line.productSkuId,
              sku: line.sku,
              variantName: line.variantName,
              warehouseId: header.warehouseId,
              warehouseName: header.warehouseName,
              movementType: "PURCHASE_RECEIPT",
              quantity: stockDelta,
              delta: stockDelta,
              referenceType: "goods_receipt",
              referenceId: localId,
              reason: `Receipt ${receipt.receiptNumber}`,
              createdAt: now,
            },
          });
        }
        await persistReceivePriceChangesLocal(header, lines, skuIdsWithProductUpsert);
        await persistReturnSettlementsLocal(
          localId,
          receipt.receiptNumber,
          header.warehouseId,
          header.warehouseName,
          pendingReturns,
          returnSettlements,
          now,
        );
        void syncNow();
        setSuccess(receipt);
        return;
      }
      for (const line of lines) {
        if (!line.vendorSkuId || !pricesChanged(line)) continue;
        await purchaseOrdersApi.updateItemPrice(
          id,
          line.purchaseOrderItemId,
          {
            unitCost: line.receivingUnitCost,
            sellingPrice: line.currentSellingPrice,
          },
        );
      }
      const receipt = await goodsReceiptsApi.createReceipt(id, {
        receiptDate,
        voucherNumber: voucherNumber.trim() || null,
        notes: notes.trim(),
        discount: discountAmount,
        tax: taxN,
        otherCharges: otherN,
        returnAdjustments:
          returnAdjustments.length > 0 ? returnAdjustments : undefined,
        items: lines.map((l) => ({
          purchaseOrderItemId: l.purchaseOrderItemId,
          receivedQuantity: l.receiveQuantity,
          bonusQuantity: l.bonusQuantity,
          receivingUnitCost: l.receivingUnitCost,
          discountPercent: l.discountPercent,
        })),
      });

      try {
        await window.blackbox?.localDb?.upsertGoodsReceipt(receipt);
        const po = await purchaseOrdersApi.get(id);
        await window.blackbox?.localDb?.upsertPurchaseOrder(po);
      } catch {
        /* optional cache */
      }

      setSuccess(receipt);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Failed to confirm receiving"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-muted-foreground text-sm">Loading…</p>;
  }

  if (success) {
    return (
      <PrintDocument>
        <div className="mx-auto max-w-xl space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                Receiving Voucher Created
              </h1>
              <p className="text-muted-foreground mt-1 text-sm">
                Inventory has been updated for the selected warehouse.
              </p>
            </div>
            <div className="no-print">
              <PrintButton />
            </div>
          </div>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Receipt</dt>
            <dd className="font-medium">{success.receiptNumber}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Purchase Order</dt>
            <dd className="font-medium">{success.poNumber}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Warehouse</dt>
            <dd className="font-medium">{success.warehouseName}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Total</dt>
            <dd className="font-medium tabular-nums">
              {success.total.toLocaleString()}
            </dd>
          </div>
          {success.returnCredit > 0 ? (
            <div>
              <dt className="text-muted-foreground">Return credit</dt>
              <dd className="font-medium tabular-nums">
                {success.returnCredit.toLocaleString()}
              </dd>
            </div>
          ) : null}
        </dl>
        <div className="no-print flex flex-wrap gap-3">
          <Button
            onClick={() =>
              navigate(`/goods-receipts/${success.id}`, {
                state: { receipt: success },
              })
            }
          >
            View Receipt
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate("/purchase-orders")}
          >
            Back to Purchase Orders
          </Button>
        </div>
        </div>
      </PrintDocument>
    );
  }

  if (!header) {
    return (
      <div
        role="alert"
        className="border-destructive/40 bg-destructive/5 text-destructive rounded-lg border px-4 py-3 text-sm"
      >
        {error ?? "Unable to load receiving form"}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Receive Purchase Order
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Enter received quantities. Confirming posts stock to{" "}
          {header.warehouseName}.
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

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Purchase Order</Label>
          <Input value={header.poNumber} disabled />
        </div>
        <div className="space-y-1.5">
          <Label>Vendor</Label>
          <Input value={header.vendorName} disabled />
        </div>
        <div className="space-y-1.5">
          <Label>Warehouse</Label>
          <Input value={header.warehouseName} disabled />
        </div>
        <div className="space-y-1.5">
          <Label>Receipt date</Label>
          <Input
            type="date"
            value={receiptDate}
            onChange={(e) => setReceiptDate(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Voucher number</Label>
          <Input
            value={voucherNumber}
            onChange={(e) => setVoucherNumber(e.target.value)}
            placeholder="optional"
          />
        </div>
      </section>

      {pendingReturns.length > 0 ? (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-medium">Pending returns</h2>
            <p className="text-muted-foreground text-sm">
              Open vendor returns for {header.vendorName}. Choose how to settle
              each line on this receipt.
            </p>
          </div>
          <div className="border-border overflow-x-auto rounded-lg border">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Return</th>
                  <th className="px-3 py-2 font-medium">Product</th>
                  <th className="px-3 py-2 font-medium">Reason</th>
                  <th className="px-3 py-2 font-medium">Qty</th>
                  <th className="px-3 py-2 font-medium">Purchase cost</th>
                  <th className="px-3 py-2 font-medium">Amount</th>
                  <th className="px-3 py-2 font-medium">Settlement</th>
                </tr>
              </thead>
              <tbody>
                {pendingReturns.map((line) => (
                  <tr
                    key={line.vendorReturnItemId}
                    className="border-border border-t"
                  >
                    <td className="px-3 py-2">{line.returnNumber}</td>
                    <td className="px-3 py-2">
                      {line.productName}
                      <div className="text-muted-foreground text-xs">
                        {line.sku}
                        {line.variantName ? ` · ${line.variantName}` : ""}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {VENDOR_RETURN_REASON_LABELS[line.reason]}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {line.quantity} {line.purchaseUnitName || ""}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {line.unitCost.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {line.lineTotal.toLocaleString()}
                    </td>
                    <td className="px-3 py-2">
                      <select
                        className="border-input bg-background h-8 min-w-[8rem] rounded-md border px-2 text-sm"
                        value={
                          returnSettlements[line.vendorReturnItemId] ?? ""
                        }
                        onChange={(e) => {
                          const value = e.target.value as ReturnSettlementChoice;
                          setReturnSettlements((prev) => ({
                            ...prev,
                            [line.vendorReturnItemId]: value,
                          }));
                        }}
                      >
                        <option value="">Skip</option>
                        <option value="CASHBACK">Cashback</option>
                        <option value="REPLACE">Replace</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Items</h2>
        <div className="border-border overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Product</th>
                <th className="px-3 py-2 font-medium">SKU</th>
                <th className="px-3 py-2 font-medium">Ordered</th>
                <th className="px-3 py-2 font-medium">Receive qty</th>
                <th className="px-3 py-2 font-medium">Bonus / Sample</th>
                <th className="px-3 py-2 font-medium">PO price</th>
                <th className="px-3 py-2 font-medium">Discount %</th>
                <th className="px-3 py-2 font-medium">Total</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                  <tr
                    key={line.purchaseOrderItemId}
                    className="border-border border-t"
                  >
                    <td className="px-3 py-2">
                      {line.productName}
                      <div className="text-muted-foreground text-xs">
                        {line.variantName || "—"}
                      </div>
                    </td>
                    <td className="px-3 py-2">{line.sku}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {line.orderedQuantity} {line.purchaseUnitName || ""}
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        className="h-8 w-24"
                        value={String(line.receiveQuantity)}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          updateLine(line.purchaseOrderItemId, {
                            receiveQuantity: Number.isNaN(n)
                              ? line.receiveQuantity
                              : n,
                          });
                        }}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        className="h-8 w-24"
                        value={String(line.bonusQuantity)}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          updateLine(line.purchaseOrderItemId, {
                            bonusQuantity: Number.isNaN(n)
                              ? line.bonusQuantity
                              : n,
                          });
                        }}
                      />
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {line.receivingUnitCost.toLocaleString()}
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        className="h-8 w-20"
                        value={String(line.discountPercent)}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          updateLine(line.purchaseOrderItemId, {
                            discountPercent: Number.isNaN(n)
                              ? line.discountPercent
                              : n,
                          });
                        }}
                      />
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {lineTotalAfterDiscount(
                        line.receiveQuantity,
                        line.receivingUnitCost,
                        line.discountPercent,
                      ).toLocaleString()}
                    </td>
                    <td className="px-3 py-2">
                      {line.vendorSkuId ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setPriceEdit({
                              productLabel: `${line.productName} · ${line.sku}`,
                              currentPrice: line.receivingUnitCost,
                              currentSellingPrice: line.currentSellingPrice,
                              purchaseOrderItemId: line.purchaseOrderItemId,
                              purchaseUnitName: line.purchaseUnitName,
                              unitsPerPurchaseUnit: line.unitsPerPurchaseUnit,
                            })
                          }
                        >
                          Update SKU Price
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid max-w-sm gap-3 text-sm sm:ml-auto">
        <div className="flex justify-between gap-6">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="tabular-nums">{subtotal.toLocaleString()}</span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <Label htmlFor="discount">Discount %</Label>
          <Input
            id="discount"
            className="h-8 w-28"
            value={discount}
            onChange={(e) => setDiscount(e.target.value)}
          />
        </div>
        <div className="flex justify-between gap-6">
          <span className="text-muted-foreground">Discount amount</span>
          <span className="tabular-nums">
            {discountAmount.toLocaleString()}
          </span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <Label htmlFor="tax">Tax</Label>
          <Input
            id="tax"
            className="h-8 w-28"
            value={tax}
            onChange={(e) => setTax(e.target.value)}
          />
        </div>
        <div className="flex items-center justify-between gap-6">
          <Label htmlFor="other">Other charges</Label>
          <Input
            id="other"
            className="h-8 w-28"
            value={otherCharges}
            onChange={(e) => setOtherCharges(e.target.value)}
          />
        </div>
        {returnCredit > 0 ? (
          <div className="flex justify-between gap-6">
            <span className="text-muted-foreground">Return credit</span>
            <span className="tabular-nums text-green-700 dark:text-green-400">
              −{returnCredit.toLocaleString()}
            </span>
          </div>
        ) : null}
        <div className="flex justify-between gap-6 border-t pt-2 font-medium">
          <span>Grand total</span>
          <span className="tabular-nums">{grandTotal.toLocaleString()}</span>
        </div>
      </section>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          disabled={saving || totalReceiveQty <= 0}
          onClick={() => void onConfirm()}
        >
          {saving ? "Confirming…" : "Confirm Receiving"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => navigate(`/purchase-orders/${id}`)}
        >
          Cancel
        </Button>
      </div>

      {priceEdit ? (
        <UpdateVendorSkuPriceDialog
          open
          productLabel={priceEdit.productLabel}
          currentPrice={priceEdit.currentPrice}
          currentSellingPrice={priceEdit.currentSellingPrice}
          purchaseUnitName={priceEdit.purchaseUnitName}
          unitsPerPurchaseUnit={priceEdit.unitsPerPurchaseUnit}
          onClose={() => setPriceEdit(null)}
          onSaved={(newPrice, newSellingPrice) => {
            setLines((prev) =>
              prev.map((l) =>
                l.purchaseOrderItemId === priceEdit.purchaseOrderItemId
                  ? {
                      ...l,
                      poUnitCost: newPrice,
                      receivingUnitCost: newPrice,
                      currentVendorPurchasePrice: newPrice,
                      currentSellingPrice: newSellingPrice,
                    }
                  : l,
              ),
            );
          }}
        />
      ) : null}
    </div>
  );
}
