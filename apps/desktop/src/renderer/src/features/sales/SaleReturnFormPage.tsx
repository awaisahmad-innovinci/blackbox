import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type {
  ReturnableSaleLine,
  SaleDetail,
  SalePaymentMethod,
  SaleReturnDetail,
} from "@blackbox/shared";
import { lineTotalAfterDiscount, saleBillTotals } from "@blackbox/shared";
import { cn } from "@blackbox/ui/lib/utils";
import { Button } from "@blackbox/ui/button";
import { Input } from "@blackbox/ui/input";
import { Label } from "@blackbox/ui/label";
import { ScanBarcodePanel } from "@renderer/components/scan-barcode-panel";
import {
  KEYBOARD_HINT_SCAN,
  KeyboardHints,
} from "@renderer/components/keyboard-hints";
import {
  ListTableFocusable,
  ListTableRow,
} from "@renderer/components/list-table-row";
import { PrintButton } from "@renderer/components/print-button";
import { PrintDocument } from "@renderer/components/print-document";
import { usePageKeyboard } from "@renderer/lib/use-page-keyboard";
import { getApiErrorMessage } from "@renderer/lib/api/client";
import { saleReturnsApi } from "@renderer/lib/api/sale-returns";
import { logActivityEvent } from "@renderer/lib/api/activity-logs";
import { syncNow } from "@renderer/lib/sync/sync-status";
import { commitLocalChange, isDeviceBound } from "@renderer/lib/local-db/local-write";
import {
  loadReturnableSaleLines,
  loadSale,
  loadSkuByBarcode,
} from "@renderer/lib/local-db/entity-source";
import { allocateSaleReturnNumber } from "@renderer/lib/document-numbers";
import { focusLineQty } from "@renderer/lib/focus-line-qty";
import { useSession } from "@renderer/lib/session/context";
import { useSalesAccess } from "@renderer/lib/use-sales-access";
import { defaultRouteForUser } from "@renderer/lib/sales-access";
import {
  buildDraftSaleReturnDetail,
  buildReturnLineItems,
  type DraftReturnLine,
} from "./sale-return-draft-detail";
import { SaleReturnThermalReceipt } from "./sale-return-thermal-receipt";

const NOT_ON_BILL_ERROR = "This SKU is not on this bill";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function formatDiscountPercent(value: number): string {
  if (value <= 0) return "0";
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function primaryRefundMethod(
  payments: SaleDetail["payments"],
): SalePaymentMethod {
  const cash = payments.find((p) => p.method === "CASH");
  if (cash) return "CASH";
  const card = payments.find((p) => p.method === "CARD");
  if (card) return "CARD";
  return (payments[0]?.method as SalePaymentMethod) ?? "CASH";
}

export function SaleReturnFormPage() {
  const { saleId = "" } = useParams();
  const navigate = useNavigate();
  const { user } = useSession();
  const permissions = user?.permissions ?? [];
  const { canReturn } = useSalesAccess();
  const [sale, setSale] = useState<SaleDetail | null>(null);
  const [returnableLines, setReturnableLines] = useState<ReturnableSaleLine[]>(
    [],
  );
  const [lines, setLines] = useState<DraftReturnLine[]>([]);
  const [returnDate, setReturnDate] = useState(todayIso());
  const [scanOpen, setScanOpen] = useState(false);
  const [scanBusy, setScanBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const returnableByLineId = useMemo(
    () => new Map(returnableLines.map((line) => [line.saleLineId, line])),
    [returnableLines],
  );

  const returnQtyByLineId = useMemo(
    () => new Map(lines.map((line) => [line.saleLineId, line.returnQty])),
    [lines],
  );

  useEffect(() => {
    if (!canReturn) navigate(defaultRouteForUser(permissions), { replace: true });
  }, [canReturn, navigate, permissions]);

  useEffect(() => {
    if (!saleId) return;
    let cancelled = false;
    setLoading(true);
    void Promise.all([loadSale(saleId), loadReturnableSaleLines(saleId)])
      .then(([saleDetail, returnable]) => {
        if (cancelled) return;
        if (saleDetail.status !== "POSTED") {
          setError("Only posted sales can be returned");
          setSale(null);
          return;
        }
        setSale(saleDetail);
        setReturnableLines(returnable);
        if (returnable.length === 0) {
          setError("No paid quantity left to return on this bill");
        } else {
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(getApiErrorMessage(err, "Failed to load sale"));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [saleId]);

  function findReturnableLine(
    productSkuId: string,
    barcode?: string,
  ): ReturnableSaleLine | undefined {
    const normalizedBarcode = barcode?.trim().toLowerCase() ?? "";
    return returnableLines.find(
      (line) =>
        line.productSkuId === productSkuId ||
        (normalizedBarcode &&
          line.barcode?.trim().toLowerCase() === normalizedBarcode),
    );
  }

  function addOrIncrementLine(source: ReturnableSaleLine, qty = 1) {
    let added = false;
    setLines((prev) => {
      const existing = prev.find((l) => l.saleLineId === source.saleLineId);
      if (existing) {
        const nextQty = round4(
          Math.min(source.returnableQuantity, existing.returnQty + qty),
        );
        if (nextQty <= existing.returnQty) {
          setError(
            `Max returnable for ${source.sku}: ${source.returnableQuantity}`,
          );
          return prev;
        }
        setError(null);
        return prev.map((l) =>
          l.saleLineId === source.saleLineId ? { ...l, returnQty: nextQty } : l,
        );
      }
      const returnQty = round4(Math.min(qty, source.returnableQuantity));
      if (!(returnQty > 0)) {
        setError(`No paid quantity left for ${source.sku}`);
        return prev;
      }
      setError(null);
      added = true;
      return [...prev, { ...source, returnQty }];
    });
    if (added) focusLineQty(source.productSkuId);
  }

  async function onScan(barcode: string) {
    if (!sale) return;
    setScanBusy(true);
    setError(null);
    try {
      const sku = await loadSkuByBarcode(barcode, sale.warehouseId);
      const line = findReturnableLine(sku.id, barcode);
      if (!line) {
        setError(NOT_ON_BILL_ERROR);
        return;
      }
      addOrIncrementLine(line);
      setScanOpen(false);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "SKU not found"));
    } finally {
      setScanBusy(false);
    }
  }

  function setReturnQty(source: ReturnableSaleLine, raw: string) {
    const parsed = round4(Number(raw));
    const returnQty = round4(
      Math.min(Math.max(0, parsed), source.returnableQuantity),
    );
    setLines((prev) => {
      const existing = prev.find((l) => l.saleLineId === source.saleLineId);
      if (existing) {
        return prev.map((line) =>
          line.saleLineId === source.saleLineId ? { ...line, returnQty } : line,
        );
      }
      if (returnQty > 0) {
        return [...prev, { ...source, returnQty }];
      }
      return prev;
    });
  }

  async function onConfirm() {
    if (!sale || !user?.id) return;
    const activeLines = lines.filter((l) => l.returnQty > 0);
    if (activeLines.length === 0) {
      setError("Add at least one return line");
      return;
    }
    for (const line of activeLines) {
      if (line.returnQty > line.returnableQuantity) {
        setError(`Return exceeds paid qty for ${line.sku}`);
        return;
      }
    }

    setSaving(true);
    setError(null);
    try {
      const refundMethod = primaryRefundMethod(sale.payments);
      const { items: builtItems, subtotal } = buildReturnLineItems(activeLines);
      const tax = saleBillTotals(subtotal, sale.gstRate, sale.salesTaxRate);
      const processorName = user.fullName?.trim() || user.username;

      if (await isDeviceBound()) {
        const localId = crypto.randomUUID();
        const now = new Date().toISOString();
        const returnNumber = await allocateSaleReturnNumber(user.tenantName ?? "");
        const detail: SaleReturnDetail = {
          id: localId,
          returnNumber,
          saleId: sale.id,
          saleNumber: sale.saleNumber,
          warehouseId: sale.warehouseId,
          warehouseName: sale.warehouseName,
          returnDate,
          status: "POSTED",
          subtotal,
          gstRate: sale.gstRate,
          gstAmount: tax.gstAmount,
          salesTaxRate: sale.salesTaxRate,
          salesTaxAmount: tax.salesTaxAmount,
          refundTotal: tax.total,
          refundMethod,
          notes: "",
          processedBy: user.id,
          processedByName: processorName,
          sale,
          items: builtItems,
          createdAt: now,
          updatedAt: now,
        };

        await commitLocalChange({
          entityType: "sale_return",
          entityId: localId,
          operation: "UPSERT",
          payload: detail as unknown as Record<string, unknown>,
        });

        for (const item of builtItems) {
          const movementId = crypto.randomUUID();
          await commitLocalChange({
            entityType: "inventory_movement",
            entityId: movementId,
            operation: "EVENT",
            payload: {
              id: movementId,
              productSkuId: item.productSkuId,
              sku: item.sku,
              variantName: item.variantName,
              warehouseId: sale.warehouseId,
              warehouseName: sale.warehouseName,
              movementType: "SALE_RETURN",
              quantity: item.quantity,
              delta: item.quantity,
              referenceType: "sale_return",
              referenceId: localId,
              reason: `Return ${returnNumber} for sale ${sale.saleNumber}`,
              createdAt: now,
            },
          });
        }

        await logActivityEvent(
          {
            eventType: "sale.return_posted",
            actorUserId: user.id,
            summary: `${processorName} processed return ${returnNumber} for sale ${sale.saleNumber}`,
            metadata: {
              returnNumber,
              returnId: localId,
              saleNumber: sale.saleNumber,
              saleId: sale.id,
              refundTotal: tax.total,
              lineCount: builtItems.length,
            },
          },
          { actorName: processorName },
        );

        void syncNow();
        navigate(`/sales/returns/${localId}`);
        return;
      }

      const detail = await saleReturnsApi.create({
        saleId: sale.id,
        returnDate,
        items: activeLines.map((l) => ({
          saleLineId: l.saleLineId,
          productSkuId: l.productSkuId,
          quantity: l.returnQty,
        })),
      });

      try {
        await window.blackbox?.localDb?.upsertSaleReturn?.(detail);
        for (const item of detail.items) {
          await window.blackbox?.localDb?.applyInventoryOutBalanceDelta?.(
            detail.warehouseId,
            item.productSkuId,
            item.quantity,
            item.unitPrice,
          );
        }
      } catch {
        /* optional cache */
      }

      await logActivityEvent(
        {
          eventType: "sale.return_posted",
          actorUserId: user.id,
          summary: `${processorName} processed return ${detail.returnNumber} for sale ${sale.saleNumber}`,
          metadata: {
            returnNumber: detail.returnNumber,
            returnId: detail.id,
            saleNumber: sale.saleNumber,
            saleId: sale.id,
            refundTotal: detail.refundTotal,
            lineCount: detail.items.length,
          },
        },
        { actorName: processorName },
      );

      navigate(`/sales/returns/${detail.id}`);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Failed to post return"));
    } finally {
      setSaving(false);
    }
  }

  usePageKeyboard({
    enabled: Boolean(sale) && returnableLines.length > 0,
    onSave: () => {
      if (!saving && lines.some((l) => l.returnQty > 0)) void onConfirm();
    },
    onScan: () => {
      if (!sale || scanBusy || saving) return;
      setScanOpen(true);
    },
  });

  if (loading) {
    return <p className="text-muted-foreground text-sm">Loading sale…</p>;
  }

  if (!sale) {
    return (
      <div className="space-y-4">
        <p className="text-destructive text-sm">{error ?? "Sale not found"}</p>
        <Button variant="outline" onClick={() => navigate("/sales/returns/new")}>
          Back to search
        </Button>
      </div>
    );
  }

  const activeLines = lines.filter((l) => l.returnQty > 0);
  const refundPreview =
    activeLines.length > 0
      ? saleBillTotals(
          buildReturnLineItems(activeLines).subtotal,
          sale.gstRate,
          sale.salesTaxRate,
        )
      : null;

  const processorName =
    user?.fullName?.trim() || user?.username?.trim() || "Manager";

  const draftReturnDetail = buildDraftSaleReturnDetail({
    sale,
    activeLines,
    returnDate,
    refundMethod: primaryRefundMethod(sale.payments),
    processedBy: user?.id ?? null,
    processedByName: processorName,
  });

  const postedLabel = sale.postedAt
    ? new Date(sale.postedAt).toLocaleString()
    : "—";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Return for {sale.saleNumber}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {sale.warehouseName} · Click a line or scan to select items for return
          </p>
        </div>
        <Button variant="ghost" onClick={() => navigate("/sales/returns/new")}>
          Change bill
        </Button>
      </div>

      {error ? (
        <div
          role="alert"
          className="border-destructive/40 bg-destructive/5 text-destructive rounded-lg border px-4 py-3 text-sm"
        >
          {error}
        </div>
      ) : null}

      <div className="grid max-w-md gap-3">
        <div>
          <Label htmlFor="returnDate">Return date</Label>
          <Input
            id="returnDate"
            type="date"
            value={returnDate}
            onChange={(e) => setReturnDate(e.target.value)}
          />
        </div>
      </div>

      <div className="rounded-lg border">
        <div className="border-b bg-muted/40 px-4 py-3">
          <div className="text-sm font-medium">Original invoice</div>
          <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-muted-foreground text-xs">Customer</dt>
              <dd>{sale.customerName}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Posted</dt>
              <dd>{postedLabel}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Cashier</dt>
              <dd>{sale.postedByName?.trim() || "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Bill total</dt>
              <dd className="font-semibold tabular-nums">{sale.total.toFixed(2)}</dd>
            </div>
          </dl>
          <div className="text-muted-foreground mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums">
            <span>Subtotal {sale.subtotal.toFixed(2)}</span>
            {sale.gstAmount > 0 ? (
              <span>
                GST ({sale.gstRate}%) {sale.gstAmount.toFixed(2)}
              </span>
            ) : null}
            {sale.salesTaxAmount > 0 ? (
              <span>
                Sales tax ({sale.salesTaxRate}%) {sale.salesTaxAmount.toFixed(2)}
              </span>
            ) : null}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[56rem] text-sm">
            <thead>
              <tr className="border-b bg-muted/20 text-left">
                <th className="px-4 py-2">Item</th>
                <th className="px-4 py-2 text-right">Paid qty</th>
                <th className="px-4 py-2 text-right">Disc</th>
                <th className="px-4 py-2 text-right">FOC</th>
                <th className="px-4 py-2 text-right">Price</th>
                <th className="px-4 py-2 text-right">Line total</th>
                <th className="px-4 py-2 text-right">Returned</th>
                <th className="px-4 py-2 text-right">Left</th>
                <th className="px-4 py-2 text-right">Return qty</th>
                <th className="px-4 py-2 text-right">Refund</th>
              </tr>
            </thead>
            <tbody>
              {sale.items.map((item) => {
                const returnable = returnableByLineId.get(item.id);
                const returnableQty = returnable?.returnableQuantity ?? 0;
                const returnedQty =
                  returnable?.returnedQuantity ??
                  (returnableQty === 0 ? item.quantity : 0);
                const returnQty = returnQtyByLineId.get(item.id) ?? 0;
                const isSelected = returnQty > 0;
                const lineRefund = returnable
                  ? lineTotalAfterDiscount(
                      returnQty,
                      returnable.unitPrice,
                      returnable.discountPercent,
                    )
                  : 0;

                const rowCells = (
                  <>
                    <td className="px-4 py-2">
                      <div className="font-medium">{item.sku}</div>
                      <div className="text-muted-foreground text-xs">
                        {item.productName} {item.variantName}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {item.quantity}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {formatDiscountPercent(item.discountPercent)}%
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {item.focQuantity > 0 ? item.focQuantity : 0}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {item.unitPrice.toFixed(2)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {item.lineTotal.toFixed(2)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {returnedQty}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {returnableQty}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {returnable ? (
                        <ListTableFocusable>
                          <Input
                            type="number"
                            min={0}
                            max={returnable.returnableQuantity}
                            step="any"
                            disabled={saving}
                            className="ml-auto w-24 text-right tabular-nums"
                            data-line-qty={returnable.productSkuId}
                            value={returnQty}
                            onChange={(e) =>
                              setReturnQty(returnable, e.target.value)
                            }
                          />
                        </ListTableFocusable>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {isSelected ? lineRefund.toFixed(2) : "—"}
                    </td>
                  </>
                );

                if (returnable && returnableQty > 0) {
                  return (
                    <ListTableRow
                      key={item.id}
                      className={cn(isSelected && "bg-primary/5")}
                      onActivate={() => addOrIncrementLine(returnable)}
                    >
                      {rowCells}
                    </ListTableRow>
                  );
                }

                return (
                  <tr
                    key={item.id}
                    className="border-border border-t text-muted-foreground"
                  >
                    {rowCells}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 print:hidden">
        <Button onClick={() => setScanOpen(true)} disabled={scanBusy || saving}>
          Scan barcode
        </Button>
        {draftReturnDetail ? <PrintButton openDrawerOnPrint /> : null}
        <Button
          onClick={() => void onConfirm()}
          disabled={saving || activeLines.length === 0}
        >
          {saving ? "Posting…" : "Post return"}
        </Button>
      </div>

      {refundPreview ? (
        <div className="bg-muted/40 max-w-sm rounded-lg border px-4 py-3 text-sm print:hidden">
          <div className="flex justify-between gap-2">
            <span>Refund subtotal</span>
            <span className="tabular-nums">
              {buildReturnLineItems(activeLines).subtotal.toFixed(2)}
            </span>
          </div>
          {refundPreview.gstAmount > 0 ? (
            <div className="flex justify-between gap-2">
              <span>GST ({sale.gstRate}%)</span>
              <span className="tabular-nums">{refundPreview.gstAmount.toFixed(2)}</span>
            </div>
          ) : null}
          {refundPreview.salesTaxAmount > 0 ? (
            <div className="flex justify-between gap-2">
              <span>Sales tax ({sale.salesTaxRate}%)</span>
              <span className="tabular-nums">
                {refundPreview.salesTaxAmount.toFixed(2)}
              </span>
            </div>
          ) : null}
          <div className="mt-1 flex justify-between gap-2 font-semibold">
            <span>Refund total</span>
            <span className="tabular-nums">{refundPreview.total.toFixed(2)}</span>
          </div>
          <p className="text-muted-foreground mt-1 text-xs">
            Record only — not deducted from till
          </p>
        </div>
      ) : null}

      {draftReturnDetail ? (
        <PrintDocument showStoreHeader={false}>
          <SaleReturnThermalReceipt
            detail={draftReturnDetail}
            businessName={user?.tenantName?.trim() ?? ""}
            businessAddress={user?.businessAddress}
            managerName={processorName}
          />
        </PrintDocument>
      ) : null}

      <ScanBarcodePanel
        open={scanOpen}
        busy={scanBusy}
        onOpenChange={setScanOpen}
        clearAfterComplete
        onComplete={(code) => void onScan(code)}
      />

      <KeyboardHints hints={[KEYBOARD_HINT_SCAN]} />
    </div>
  );
}
