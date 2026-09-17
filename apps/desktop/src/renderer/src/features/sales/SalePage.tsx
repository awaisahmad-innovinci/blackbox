import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import type {
  SaleDetail,
  SalePaymentMethod,
  SellUnit,
  SkuSearchResult,
  TillSessionDetail,
  WarehouseListItem,
} from "@blackbox/shared";
import {
  DEFAULT_SALE_CUSTOMER_NAME,
  isTillNearLimit,
  lineTotalForScan,
  maxCashTender,
  saleBillTotals,
  tillRemainingHeadroom,
} from "@blackbox/shared";
import { SaleThermalReceipt } from "./sale-thermal-receipt";
import { FORM_GRID } from "@renderer/lib/form-layout";
import {
  FormEnterNav,
} from "@renderer/components/form-enter-nav";
import { Button } from "@blackbox/ui/button";
import { Input } from "@blackbox/ui/input";
import { Label } from "@blackbox/ui/label";
import { PrintButton } from "@renderer/components/print-button";
import { PrintDocument } from "@renderer/components/print-document";
import { ScanBarcodePanel } from "@renderer/components/scan-barcode-panel";
import {
  KEYBOARD_HINT_ENTER,
  KEYBOARD_HINT_SAVE,
  KEYBOARD_HINT_SCAN,
  KeyboardHints,
} from "@renderer/components/keyboard-hints";
import { useConfirm } from "@renderer/components/confirm-provider";
import { removeTableLineConfirmOptions } from "@renderer/lib/confirm-remove-line";
import { useSupervisorTotp } from "@renderer/components/supervisor-totp-provider";
import { focusLineQty } from "@renderer/lib/focus-line-qty";
import { usePageKeyboard } from "@renderer/lib/use-page-keyboard";
import { getApiErrorMessage } from "@renderer/lib/api/client";
import { logActivityEvent } from "@renderer/lib/api/activity-logs";
import { salesApi } from "@renderer/lib/api/sales";
import { syncNow } from "@renderer/lib/sync/sync-status";
import { commitLocalChange, isDeviceBound } from "@renderer/lib/local-db/local-write";
import { loadSkuByBarcode, loadSale, loadWarehouses, loadPosAvailableForSale, lookupSkuByBarcode } from "@renderer/lib/local-db/entity-source";
import {
  applyTillCashFromSale,
  assertTillCanPostSale,
  loadCurrentTill,
} from "@renderer/lib/local-db/till-source";
import { AddSaleItemDialog } from "./AddSaleItemDialog";
import { CollectCashDialog } from "./CollectCashDialog";
import { allocateHoldNumber, allocateSaleNumber } from "@renderer/lib/document-numbers";
import { useSession } from "@renderer/lib/session/context";
import { useSalesAccess } from "@renderer/lib/use-sales-access";
import {
  numericInputDisplayValue,
  parseNumericInputChange,
  replaceLeadingZeroOnKeyDown,
  selectZeroNumericOnFocus,
} from "@renderer/lib/select-zero-numeric-on-focus";

type DraftSaleLine = {
  productSkuId: string;
  productName: string;
  variantName: string;
  sku: string;
  barcode: string | null;
  quantity: number;
  quantityAvailable: number;
  sellUnit: SellUnit;
  unitsPerPurchaseUnit: number;
  sellingPrice: number;
  sellingPricePerPurchaseUnit: number | null;
  lastScanMultiplier?: number;
};

type DraftPayment = {
  id: string;
  method: SalePaymentMethod;
  amount: number;
  reference: string;
};

const PAYMENT_METHODS: SalePaymentMethod[] = ["CASH", "CARD", "CREDIT"];
const NO_WAREHOUSE_ERROR = "No active warehouse configured";
const NOT_ON_BILL_ERROR = "This item is not on the current bill.";

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function lineUnitPrice(line: DraftSaleLine): number {
  const pricing = lineTotalForScan({
    quantityMultiplier:
      line.lastScanMultiplier ??
      (line.sellUnit === "box" ? line.unitsPerPurchaseUnit : 1),
    unitsPerPurchaseUnit: line.unitsPerPurchaseUnit,
    sellingPrice: line.sellingPrice,
    sellingPricePerPurchaseUnit: line.sellingPricePerPurchaseUnit,
    quantity: 1,
    sellUnit: line.sellUnit,
  });
  return pricing.unitPrice > 0 ? pricing.unitPrice : line.sellingPrice;
}

function lineTotal(line: DraftSaleLine): number {
  const pricing = lineTotalForScan({
    quantityMultiplier:
      line.lastScanMultiplier ??
      (line.sellUnit === "box" ? line.unitsPerPurchaseUnit : 1),
    unitsPerPurchaseUnit: line.unitsPerPurchaseUnit,
    sellingPrice: line.sellingPrice,
    sellingPricePerPurchaseUnit: line.sellingPricePerPurchaseUnit,
    quantity: line.quantity,
    sellUnit: line.sellUnit,
  });
  return pricing.lineTotal > 0
    ? pricing.lineTotal
    : round4(line.quantity * lineUnitPrice(line));
}

function paymentMethodLabel(method: SalePaymentMethod): string {
  if (method === "CASH") return "Cash";
  if (method === "CARD") return "Card";
  return "Credit";
}

export function SalePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { draftId: routeDraftId } = useParams();
  const { user } = useSession();
  const { canWrite, canReadList, canReadTill, canManageTill } = useSalesAccess();
  const confirm = useConfirm();
  const { promptSupervisorTotp } = useSupervisorTotp();
  const requireTotp = user?.requireManagerApprovalRemoveSaleLine ?? true;
  const requireTillWithdrawApproval =
    user?.requireManagerApprovalTillWithdraw ?? true;

  const [warehouses, setWarehouses] = useState<WarehouseListItem[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [lines, setLines] = useState<DraftSaleLine[]>([]);
  const [gstRate, setGstRate] = useState("0");
  const [salesTaxRate, setSalesTaxRate] = useState("0");
  const [payments, setPayments] = useState<DraftPayment[]>([]);
  const [scanOpen, setScanOpen] = useState(false);
  const [removeScanOpen, setRemoveScanOpen] = useState(false);
  const [itemOpen, setItemOpen] = useState(false);
  const [scanBusy, setScanBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [holding, setHolding] = useState(false);
  const [loadingDraft, setLoadingDraft] = useState(Boolean(routeDraftId));
  const [heldCount, setHeldCount] = useState(0);
  const [success, setSuccess] = useState<SaleDetail | null>(null);
  const [tillSession, setTillSession] = useState<TillSessionDetail | null>(null);
  const [collectDialogOpen, setCollectDialogOpen] = useState(false);
  const editingDraftId = routeDraftId ?? null;
  const holdNumberRef = useRef<string | null>(null);
  const holdInFlightRef = useRef(false);
  const scanQueueRef = useRef<string[]>([]);
  const scanProcessingRef = useRef(false);
  const paymentsTouchedRef = useRef(false);
  const autoScanPendingRef = useRef(!routeDraftId);

  function resetForNewSale() {
    setLines([]);
    setPayments([]);
    setCustomerName("");
    setGstRate("0");
    setSalesTaxRate("0");
    paymentsTouchedRef.current = false;
    holdNumberRef.current = null;
    setError(null);
  }

  useEffect(() => {
    if (!canWrite) navigate("/", { replace: true });
  }, [canWrite, navigate]);

  useEffect(() => {
    if (!user?.id || canManageTill) {
      setTillSession(null);
      return;
    }
    void loadCurrentTill(user.id)
      .then(setTillSession)
      .catch(() => undefined);
  }, [user?.id, canManageTill, success, location.pathname]);

  useEffect(() => {
    void loadWarehouses("active")
      .then((rows) => {
        setWarehouses(rows);
        if (rows.length > 0) {
          setWarehouseId((current) => current || rows[0]!.id);
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    autoScanPendingRef.current = !routeDraftId;
  }, [routeDraftId]);

  useEffect(() => {
    if (!autoScanPendingRef.current) return;
    if (loadingDraft || success || !warehouseId) return;
    autoScanPendingRef.current = false;
    setScanOpen(true);
  }, [loadingDraft, success, warehouseId]);

  useEffect(() => {
    void window.blackbox?.localDb
      ?.countDraftSales?.()
      .then((count) => setHeldCount(count))
      .catch(() => undefined);
  }, [routeDraftId, success]);

  useEffect(() => {
    if (!routeDraftId) {
      holdNumberRef.current = null;
      setLoadingDraft(false);
      return;
    }

    let cancelled = false;
    setLoadingDraft(true);
    setError(null);

    void loadSale(routeDraftId)
      .then(async (detail) => {
        if (cancelled) return;
        if (detail.status !== "DRAFT") {
          navigate(`/sales/${detail.id}`, { replace: true });
          return;
        }

        holdNumberRef.current = detail.saleNumber;
        setCustomerName(
          detail.customerName === DEFAULT_SALE_CUSTOMER_NAME
            ? ""
            : detail.customerName,
        );
        setWarehouseId(detail.warehouseId);
        setGstRate(String(detail.gstRate));
        setSalesTaxRate(String(detail.salesTaxRate));

        const draftLines: DraftSaleLine[] = await Promise.all(
          detail.items.map(async (item) => {
            let quantityAvailable = item.quantity;
            try {
              quantityAvailable = await loadPosAvailableForSale(
                detail.warehouseId,
                item.productSkuId,
                detail.id,
              );
            } catch {
              /* keep line qty as fallback */
            }
            return {
              productSkuId: item.productSkuId,
              productName: item.productName,
              variantName: item.variantName,
              sku: item.sku,
              barcode: item.barcode,
              quantity: item.quantity,
              quantityAvailable,
              sellUnit: item.sellUnit,
              unitsPerPurchaseUnit: 1,
              sellingPrice: item.unitPrice,
              sellingPricePerPurchaseUnit: null,
            };
          }),
        );
        setLines(draftLines);

        if (detail.payments.length > 0) {
          paymentsTouchedRef.current = true;
          setPayments(
            detail.payments.map((row) => ({
              id: row.id,
              method: row.method,
              amount: row.amount,
              reference: row.reference,
            })),
          );
        } else {
          setPayments([]);
          paymentsTouchedRef.current = false;
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(getApiErrorMessage(err, "Held bill not found"));
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingDraft(false);
      });

    return () => {
      cancelled = true;
    };
  }, [routeDraftId, navigate]);

  const subtotal = useMemo(
    () => round4(lines.reduce((sum, line) => sum + lineTotal(line), 0)),
    [lines],
  );

  const tax = useMemo(
    () =>
      saleBillTotals(
        subtotal,
        Number(gstRate) || 0,
        Number(salesTaxRate) || 0,
      ),
    [subtotal, gstRate, salesTaxRate],
  );

  const billTotal = tax.total;
  const payment = payments[0] ?? null;
  const tendered = payment ? round4(payment.amount) : 0;
  const isCashPayment = payment?.method === "CASH";
  const cashMaxTender = maxCashTender(billTotal);
  const cashChange = isCashPayment
    ? round4(Math.max(0, tendered - billTotal))
    : 0;
  const cashShortfall = isCashPayment
    ? round4(Math.max(0, billTotal - tendered))
    : 0;
  const cardRemaining = !isCashPayment
    ? round4(billTotal - tendered)
    : 0;
  const cashOverMax = isCashPayment && tendered > cashMaxTender;

  function resolvedCashTendered(): number | null {
    if (!payment || payment.method !== "CASH") return null;
    return tendered;
  }

  useEffect(() => {
    if (lines.length === 0) {
      setPayments([]);
      paymentsTouchedRef.current = false;
      return;
    }
    if (paymentsTouchedRef.current || !(billTotal > 0)) return;

    setPayments((prev) => {
      if (prev.length !== 1) {
        const existing = prev[0];
        return [
          {
            id: existing?.id ?? crypto.randomUUID(),
            method: "CASH",
            amount: billTotal,
            reference: "",
          },
        ];
      }
      if (prev[0]!.method === "CASH" && !prev[0]!.reference.trim()) {
        return [{ ...prev[0]!, amount: billTotal }];
      }
      return prev;
    });
  }, [lines.length, billTotal]);

  const canPost = useMemo(() => {
    if (lines.length === 0 || !payment) return false;
    if (
      !lines.every(
        (line) => line.quantity > 0 && line.quantity <= line.quantityAvailable,
      )
    ) {
      return false;
    }
    if (payment.method === "CASH") {
      return tendered >= billTotal && tendered <= cashMaxTender;
    }
    return tendered === billTotal;
  }, [lines, payment, tendered, billTotal, cashMaxTender]);

  const canHold = lines.length > 0 && !loadingDraft;

  function buildDetailFromForm(options: {
    id: string;
    saleNumber: string;
    status: SaleDetail["status"];
    postedAt?: string | null;
  }): SaleDetail {
    const warehouseName =
      warehouses.find((warehouse) => warehouse.id === warehouseId)?.name ?? "";
    const gst = Number(gstRate) || 0;
    const salesTax = Number(salesTaxRate) || 0;
    const now = new Date().toISOString();
    const resolvedCustomerName =
      customerName.trim() || DEFAULT_SALE_CUSTOMER_NAME;
    const resolvedCashierName = user?.fullName?.trim() || "—";
    const items = lines.map((line) => {
      const unitPrice = lineUnitPrice(line);
      return {
        id: crypto.randomUUID(),
        productSkuId: line.productSkuId,
        productName: line.productName,
        variantName: line.variantName,
        sku: line.sku,
        barcode: line.barcode,
        quantity: line.quantity,
        unitPrice,
        lineTotal: lineTotal(line),
        sellUnit: line.sellUnit,
      };
    });
    const paymentRows = payment
      ? [
          {
            id: payment.id,
            method: payment.method,
            amount: round4(payment.amount),
            reference: payment.reference.trim(),
          },
        ]
      : [];

    return {
      id: options.id,
      saleNumber: options.saleNumber,
      warehouseId,
      warehouseName,
      status: options.status,
      subtotal,
      gstRate: gst,
      gstAmount: tax.gstAmount,
      salesTaxRate: salesTax,
      salesTaxAmount: tax.salesTaxAmount,
      total: tax.total,
      customerName: resolvedCustomerName,
      cashTendered: resolvedCashTendered(),
      notes: "",
      deviceId: null,
      postedBy: user?.id ?? null,
      postedByName:
        resolvedCashierName !== "—" ? resolvedCashierName : null,
      postedAt: options.postedAt ?? null,
      items,
      payments: paymentRows,
      createdAt: now,
      updatedAt: now,
    };
  }

  function postedPaymentRows() {
    if (!payment) return [];
    const postedAmount =
      payment.method === "CASH" ? billTotal : round4(payment.amount);
    return [
      {
        id: payment.id,
        method: payment.method,
        amount: postedAmount,
        reference: payment.reference.trim(),
      },
    ];
  }

  function upsertScannedLine(row: SkuSearchResult): string | null {
    const available = row.quantityAvailable ?? 0;
    if (available <= 0) {
      return `No POS balance for ${row.sku}`;
    }

    const multiplier = row.scannedQuantityMultiplier ?? 1;
    const unitsPerPurchaseUnit = row.unitsPerPurchaseUnit ?? 1;
    const sellUnit: SellUnit =
      multiplier > 1 && multiplier >= unitsPerPurchaseUnit ? "box" : "pc";

    let scanError: string | null = null;

    setLines((prev) => {
      const existing = prev.find((line) => line.productSkuId === row.id);
      if (existing) {
        const nextQty = round4(existing.quantity + multiplier);
        if (nextQty > available) {
          scanError = `Cannot exceed POS balance (${available}) for ${row.sku}`;
          return prev;
        }
        focusLineQty(row.id);
        return prev.map((line) =>
          line.productSkuId === row.id
            ? {
                ...line,
                quantity: nextQty,
                lastScanMultiplier: multiplier,
                sellUnit,
              }
            : line,
        );
      }

      if (multiplier > available) {
        scanError = `Cannot exceed POS balance (${available}) for ${row.sku}`;
        return prev;
      }

      focusLineQty(row.id);
      return [
        ...prev,
        {
          productSkuId: row.id,
          productName: row.productName,
          variantName: row.variantName,
          sku: row.sku,
          barcode: row.barcode,
          quantity: multiplier,
          quantityAvailable: available,
          sellUnit,
          unitsPerPurchaseUnit,
          sellingPrice: row.sellingPrice ?? 0,
          sellingPricePerPurchaseUnit: row.sellingPricePerPurchaseUnit ?? null,
          lastScanMultiplier: multiplier,
        },
      ];
    });

    return scanError;
  }

  function onAddManyFromDialog(rows: SkuSearchResult[]) {
    if (!warehouseId) {
      setError(NO_WAREHOUSE_ERROR);
      return;
    }
    let lastError: string | null = null;
    for (const row of rows) {
      const err = upsertScannedLine(row);
      if (err) lastError = err;
    }
    if (lastError) {
      setError(lastError);
    } else {
      setError(null);
    }
    setItemOpen(false);
  }

  async function processScanQueue(): Promise<void> {
    if (scanProcessingRef.current) return;
    scanProcessingRef.current = true;
    setScanBusy(true);

    try {
      while (scanQueueRef.current.length > 0) {
        const code = scanQueueRef.current.shift()!;
        if (!warehouseId) {
          setError(NO_WAREHOUSE_ERROR);
          continue;
        }
        try {
          const row = await loadSkuByBarcode(code, warehouseId, {
            balance: "pos",
            excludeDraftSaleId: editingDraftId,
          });
          const err = upsertScannedLine(row);
          if (err) setError(err);
        } catch (err: unknown) {
          setError(getApiErrorMessage(err, "SKU not found for barcode"));
        }
      }
    } finally {
      scanProcessingRef.current = false;
      setScanBusy(false);
    }
  }

  function onBarcodeEnter(scannedCode: string) {
    setError(null);
    const code = scannedCode.trim();
    if (!warehouseId) {
      setError(NO_WAREHOUSE_ERROR);
      return;
    }
    if (!code) return;

    scanQueueRef.current.push(code);
    void processScanQueue();
  }

  function findLineByBarcodeOnBill(code: string): DraftSaleLine | null {
    const trimmed = code.trim();
    if (!trimmed) return null;
    return lines.find((line) => line.barcode === trimmed) ?? null;
  }

  async function resolveLineForRemoveScan(
    code: string,
  ): Promise<DraftSaleLine | null> {
    const direct = findLineByBarcodeOnBill(code);
    if (direct) return direct;

    const lookup = await lookupSkuByBarcode(code);
    if (!lookup) return null;
    return lines.find((line) => line.productSkuId === lookup.id) ?? null;
  }

  async function removeBillLine(
    line: DraftSaleLine,
    options: { confirm: boolean },
  ): Promise<boolean> {
    let supervisorUserId: string | null = null;
    let supervisorDisplayName: string | null = null;
    if (requireTotp) {
      const totp = await promptSupervisorTotp();
      if (!totp.approved) return false;
      supervisorUserId = totp.supervisorUserId;
      supervisorDisplayName = totp.supervisorDisplayName;
    }
    if (options.confirm) {
      const ok = await confirm(removeTableLineConfirmOptions(line.sku));
      if (!ok) return false;
    }
    setLines((prev) =>
      prev.filter((row) => row.productSkuId !== line.productSkuId),
    );
    if (user?.id) {
      const actorName = user.fullName?.trim() || user.username;
      await logActivityEvent(
        {
          eventType: "sale.line_removed",
          actorUserId: user.id,
          supervisorUserId,
          summary: `Removed ${line.sku} from bill`,
          metadata: {
            sku: line.sku,
            productName: line.productName,
            variantName: line.variantName,
          },
        },
        {
          actorName,
          supervisorName: supervisorDisplayName,
        },
      );
    }
    setError(null);
    return true;
  }

  async function onRemoveBarcodeEnter(scannedCode: string) {
    setError(null);
    const code = scannedCode.trim();
    if (!code) return;

    const line = await resolveLineForRemoveScan(code);
    if (!line) {
      setError(NOT_ON_BILL_ERROR);
      return;
    }
    await removeBillLine(line, { confirm: false });
  }

  async function onHoldBill() {
    if (!warehouseId || lines.length === 0) return;
    if (holdInFlightRef.current) return;
    holdInFlightRef.current = true;
    setError(null);
    setHolding(true);
    try {
      const draftId = editingDraftId ?? crypto.randomUUID();
      const holdNumber =
        holdNumberRef.current ??
        (await allocateHoldNumber(user?.tenantName ?? ""));
      const detail = buildDetailFromForm({
        id: draftId,
        saleNumber: holdNumber,
        status: "DRAFT",
      });
      await window.blackbox?.localDb?.upsertSaleDraft?.(detail);
      resetForNewSale();
      try {
        const count = await window.blackbox?.localDb?.countDraftSales?.();
        if (count != null) setHeldCount(count);
      } catch {
        /* badge refresh is best-effort */
      }
      navigate("/sales/new", { replace: true });
      setHolding(false);
      holdInFlightRef.current = false;
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Failed to hold bill"));
      setHolding(false);
      holdInFlightRef.current = false;
    }
  }

  async function onDiscardDraft() {
    if (!editingDraftId) return;
    const ok = await confirm({
      title: "Discard held bill?",
      description: `${holdNumberRef.current ?? "This bill"} will be removed. Reserved stock is released.`,
      confirmLabel: "Discard",
    });
    if (!ok) return;

    setError(null);
    try {
      await window.blackbox?.localDb?.deleteSaleDraft?.(editingDraftId);
      navigate("/sales/new");
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Failed to discard held bill"));
    }
  }

  const tillBlocked =
    !canManageTill &&
    !loadingDraft &&
    !success &&
    tillSession?.status !== "OPEN";

  const tillNearLimit =
    tillSession != null &&
    !canManageTill &&
    !tillBlocked &&
    isTillNearLimit(tillSession);

  async function onConfirm() {
    setError(null);
    if (!warehouseId) {
      setError(NO_WAREHOUSE_ERROR);
      return;
    }
    if (!canPost) {
      setError(
        payment?.method === "CASH"
          ? "Enter cash tender at least equal to the bill total (within max limit)"
          : "Payment amount must match the bill total",
      );
      return;
    }
    if (tillBlocked) {
      setError(
        tillSession?.status === "CLOSED_LIMIT"
          ? "Till cash limit reached. Contact a manager to withdraw and reopen."
          : tillSession?.status === "PENDING_APPROVAL"
            ? "Till is pending manager approval."
            : "Open your till before posting sales.",
      );
      return;
    }

    const cashPaymentTotal = postedPaymentRows()
      .filter((row) => row.method === "CASH")
      .reduce((sum, row) => sum + row.amount, 0);

    if (user?.id) {
      try {
        await assertTillCanPostSale({
          userId: user.id,
          skipForManager: canManageTill,
          cashPaymentTotal,
        });
      } catch (err: unknown) {
        setError(getApiErrorMessage(err, "Till is not ready for this sale"));
        return;
      }
    }

    setSaving(true);
    try {
      const gst = Number(gstRate) || 0;
      const salesTax = Number(salesTaxRate) || 0;
      const resolvedCustomerName =
        customerName.trim() || DEFAULT_SALE_CUSTOMER_NAME;
      const resolvedCashierName = user?.fullName?.trim() || "—";

      if (await isDeviceBound()) {
        const localId = editingDraftId ?? crypto.randomUUID();
        const now = new Date().toISOString();
        const saleNumber = await allocateSaleNumber(user?.tenantName ?? "");
        const items = lines.map((line) => {
          const unitPrice = lineUnitPrice(line);
          return {
            id: crypto.randomUUID(),
            productSkuId: line.productSkuId,
            productName: line.productName,
            variantName: line.variantName,
            sku: line.sku,
            barcode: line.barcode,
            quantity: line.quantity,
            unitPrice,
            lineTotal: lineTotal(line),
            sellUnit: line.sellUnit,
          };
        });
        const paymentRows = postedPaymentRows();
        const warehouseName =
          warehouses.find((warehouse) => warehouse.id === warehouseId)?.name ??
          "";
        const detail: SaleDetail = {
          id: localId,
          saleNumber,
          warehouseId,
          warehouseName,
          status: "POSTED",
          subtotal,
          gstRate: gst,
          gstAmount: tax.gstAmount,
          salesTaxRate: salesTax,
          salesTaxAmount: tax.salesTaxAmount,
          total: tax.total,
          customerName: resolvedCustomerName,
          cashTendered: resolvedCashTendered(),
          notes: "",
          deviceId: null,
          postedBy: user?.id ?? null,
          postedByName: resolvedCashierName === "—" ? null : resolvedCashierName,
          postedAt: now,
          items,
          payments: paymentRows,
          createdAt: now,
          updatedAt: now,
        };

        await commitLocalChange({
          entityType: "sale",
          entityId: localId,
          operation: "UPSERT",
          payload: detail as unknown as Record<string, unknown>,
        });

        for (const item of items) {
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
              warehouseId,
              warehouseName,
              movementType: "SALE",
              quantity: item.quantity,
              delta: -item.quantity,
              referenceType: "sale",
              referenceId: localId,
              reason: `Sale ${saleNumber}`,
              createdAt: now,
            },
          });
        }

        void syncNow();
        if (user?.id) {
          await applyTillCashFromSale({
            userId: user.id,
            skipForManager: canManageTill,
            cashPaymentTotal,
          });
          const refreshed = await loadCurrentTill(user.id);
          setTillSession(refreshed);
          if (refreshed?.status === "CLOSED_LIMIT") {
            await logActivityEvent(
              {
                eventType: "till.limit_reached",
                actorUserId: user.id,
                subjectUserId: user.id,
                summary: "Till cash limit reached",
                metadata: {
                  tillSessionId: refreshed.id,
                  currentCashBalance: refreshed.currentCashBalance,
                  maxCashLimit: refreshed.maxCashLimit,
                },
              },
              {
                actorName: user.fullName?.trim() || user.username,
                subjectName: user.fullName?.trim() || user.username,
              },
            );
          }
        }
        setSuccess(detail);
        return;
      }

      const detail = await salesApi.create({
        warehouseId,
        gstRate: gst,
        salesTaxRate: salesTax,
        customerName: resolvedCustomerName,
        cashTendered: resolvedCashTendered() ?? undefined,
        items: lines.map((line) => ({
          productSkuId: line.productSkuId,
          quantity: line.quantity,
          unitPrice: lineUnitPrice(line),
          lineTotal: lineTotal(line),
          sellUnit: line.sellUnit,
          barcode: line.barcode,
        })),
        payments: postedPaymentRows().map((row) => ({
          method: row.method,
          amount: row.amount,
          reference: row.reference || undefined,
        })),
      });

      if (editingDraftId) {
        try {
          await window.blackbox?.localDb?.deleteSaleDraft?.(editingDraftId);
        } catch {
          /* draft cleanup is best-effort */
        }
      }

      try {
        await window.blackbox?.localDb?.upsertSale?.(detail);
      } catch {
        /* optional cache */
      }
      setSuccess(detail);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Failed to post sale"));
    } finally {
      setSaving(false);
    }
  }

  usePageKeyboard({
    enabled: !success && !loadingDraft,
    onSave: () => {
      if (!saving && canPost) void onConfirm();
    },
    onScan: () => {
      if (
        !warehouseId ||
        scanBusy ||
        itemOpen ||
        removeScanOpen ||
        success
      ) {
        return;
      }
      setScanOpen(true);
    },
  });

  if (success) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {success.saleNumber}
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Sale posted
            </p>
          </div>
          <div className="flex gap-2 print:hidden">
            <PrintButton />
            <Button onClick={() => navigate(`/sales/${success.id}`)}>View</Button>
            <Button
              variant="outline"
              onClick={() => {
                autoScanPendingRef.current = true;
                setSuccess(null);
                resetForNewSale();
              }}
            >
              New sale
            </Button>
          </div>
        </div>

        <PrintDocument showStoreHeader={false}>
          <SaleThermalReceipt
            detail={success}
            businessName={user?.tenantName?.trim() ?? ""}
            businessAddress={user?.businessAddress}
            cashierName={
              success.postedByName?.trim() || user?.fullName?.trim() || "—"
            }
          />
        </PrintDocument>
      </div>
    );
  }

  if (loadingDraft) {
    return <p className="text-muted-foreground text-sm">Loading held bill…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {editingDraftId
              ? holdNumberRef.current ?? "Held bill"
              : "New sale"}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {editingDraftId
              ? "Resume this held bill, post when ready, or discard to release stock"
              : "Scan items from POS floor balance and collect payment"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canWrite ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate("/sales/held")}
            >
              Held bills
              {heldCount > 0 ? ` (${heldCount})` : ""}
            </Button>
          ) : null}
          {canReadList ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate("/sales")}
            >
              Past sales
            </Button>
          ) : canReadTill ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate("/sales/till")}
            >
              My till
            </Button>
          ) : null}
          {!canManageTill && tillSession?.status === "OPEN" ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setCollectDialogOpen(true)}
            >
              Withdraw cash
            </Button>
          ) : null}
        </div>
      </div>

      {tillBlocked ? (
        <div
          role="alert"
          className="border-destructive/40 bg-destructive/5 text-destructive rounded-lg border px-4 py-3 text-sm"
        >
          {tillSession?.status === "CLOSED_LIMIT"
            ? "Till cash limit reached. Contact a manager to withdraw and reopen before posting more sales."
            : tillSession?.status === "PENDING_APPROVAL"
              ? "Till is pending manager approval."
              : "Open your till before posting sales."}{" "}
          <Button
            type="button"
            variant="link"
            className="text-destructive h-auto p-0"
            onClick={() => navigate("/sales/till")}
          >
            Go to My till
          </Button>
        </div>
      ) : null}

      {tillNearLimit ? (
        <div
          role="status"
          className="border-amber-500/40 bg-amber-500/10 text-amber-950 dark:text-amber-100 rounded-lg border px-4 py-3 text-sm"
        >
          Till is near the cash limit — Rs{" "}
          {tillRemainingHeadroom(tillSession!).toLocaleString()} headroom left.
          Tap Withdraw cash and ask a manager to authorize.{" "}
          <Button
            type="button"
            variant="link"
            className="text-amber-950 dark:text-amber-100 h-auto p-0"
            onClick={() => navigate("/sales/till")}
          >
            View My till
          </Button>
        </div>
      ) : null}

      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}

      <div className={FORM_GRID}>
        <div className="space-y-2">
          <Label htmlFor="customerName">Customer name</Label>
          <Input
            id="customerName"
            placeholder="Customer name (optional)"
            value={customerName}
            onChange={(event) => setCustomerName(event.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={
            !warehouseId || itemOpen || scanBusy || scanOpen || removeScanOpen
          }
          onClick={() => setItemOpen(true)}
        >
          Add item
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={
            !warehouseId || scanBusy || itemOpen || scanOpen || removeScanOpen
          }
          onClick={() => setScanOpen(true)}
        >
          Scan barcode
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={
            lines.length === 0 ||
            scanBusy ||
            itemOpen ||
            scanOpen ||
            removeScanOpen
          }
          onClick={() => setRemoveScanOpen(true)}
        >
          Remove item
        </Button>
      </div>

      <FormEnterNav>
        <div className="border-border overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">SKU</th>
                <th className="px-4 py-3 font-medium">Qty</th>
                <th className="px-4 py-3 font-medium">Unit price</th>
                <th className="px-4 py-3 font-medium">Line total</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.productSkuId} className="border-border border-t">
                  <td className="px-4 py-3">
                    {line.productName}
                    {line.variantName ? ` · ${line.variantName}` : ""}
                  </td>
                  <td className="px-4 py-3">{line.sku}</td>
                  <td className="px-4 py-3">
                    <Input
                      data-line-qty={line.productSkuId}
                      type="number"
                      min={0}
                      step="any"
                      className="w-28 tabular-nums"
                      value={numericInputDisplayValue(line.quantity)}
                      onFocus={selectZeroNumericOnFocus}
                      onKeyDown={replaceLeadingZeroOnKeyDown}
                      onChange={(event) => {
                        const quantity = round4(
                          parseNumericInputChange(event.target.value),
                        );
                        setLines((prev) =>
                          prev.map((row) =>
                            row.productSkuId === line.productSkuId
                              ? { ...row, quantity, lastScanMultiplier: undefined }
                              : row,
                          ),
                        );
                      }}
                    />
                    {line.quantity > line.quantityAvailable ? (
                      <p className="text-destructive mt-1 text-xs">
                        Max POS balance {line.quantityAvailable}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {lineUnitPrice(line).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {lineTotal(line).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        void removeBillLine(line, { confirm: true });
                      }}
                    >
                      Remove
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </FormEnterNav>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <h2 className="text-lg font-medium">Tax</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="gstRate">GST %</Label>
              <Input
                id="gstRate"
                type="number"
                min={0}
                step="any"
                value={gstRate}
                onFocus={selectZeroNumericOnFocus}
                onChange={(event) => setGstRate(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="salesTaxRate">Sales tax %</Label>
              <Input
                id="salesTaxRate"
                type="number"
                min={0}
                step="any"
                value={salesTaxRate}
                onFocus={selectZeroNumericOnFocus}
                onChange={(event) => setSalesTaxRate(event.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="tabular-nums">{subtotal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">GST</span>
              <span className="tabular-nums">{tax.gstAmount.toLocaleString()}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Sales tax</span>
              <span className="tabular-nums">
                {tax.salesTaxAmount.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between gap-4 font-medium">
              <span>Total</span>
              <span className="tabular-nums">{tax.total.toLocaleString()}</span>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="text-lg font-medium">Payment</h2>
          {payment ? (
            <div className="border-border grid gap-3 rounded-lg border p-3 sm:grid-cols-[8rem_1fr_1fr]">
              <div className="space-y-1">
                <Label htmlFor="paymentMethod">Method</Label>
                <select
                  id="paymentMethod"
                  className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                  value={payment.method}
                  onChange={(event) => {
                    const method = event.target.value as SalePaymentMethod;
                    paymentsTouchedRef.current = true;
                    setPayments([
                      {
                        ...payment,
                        method,
                        amount: method === "CASH" ? payment.amount : billTotal,
                      },
                    ]);
                  }}
                >
                  {PAYMENT_METHODS.map((method) => (
                    <option key={method} value={method}>
                      {paymentMethodLabel(method)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="paymentAmount">
                  {isCashPayment ? "Tendered" : "Amount"}
                </Label>
                <Input
                  id="paymentAmount"
                  type="number"
                  min={0}
                  max={isCashPayment ? cashMaxTender : billTotal}
                  step="any"
                  placeholder={isCashPayment ? "Cash received" : "Amount"}
                  value={numericInputDisplayValue(payment.amount)}
                  onFocus={selectZeroNumericOnFocus}
                  onKeyDown={replaceLeadingZeroOnKeyDown}
                  onChange={(event) => {
                    const amount = round4(
                      parseNumericInputChange(event.target.value),
                    );
                    paymentsTouchedRef.current = true;
                    setPayments([{ ...payment, amount }]);
                  }}
                />
                {isCashPayment ? (
                  <p className="text-muted-foreground text-xs">
                    Max tender: {cashMaxTender.toLocaleString()}
                  </p>
                ) : null}
                {cashOverMax ? (
                  <p className="text-destructive text-xs" role="alert">
                    You can enter only {cashMaxTender.toLocaleString()} max.
                  </p>
                ) : null}
              </div>
              <div className="space-y-1">
                <Label htmlFor="paymentReference">Reference</Label>
                <Input
                  id="paymentReference"
                  placeholder="Optional"
                  value={payment.reference}
                  onChange={(event) => {
                    paymentsTouchedRef.current = true;
                    setPayments([{ ...payment, reference: event.target.value }]);
                  }}
                />
              </div>
            </div>
          ) : null}
          {payment && isCashPayment ? (
            <div className="space-y-1 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Cash</span>
                <span className="tabular-nums">{tendered.toLocaleString()}</span>
              </div>
              {tendered > billTotal ? (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Change</span>
                  <span className="text-green-700 tabular-nums dark:text-green-400">
                    {cashChange.toLocaleString()}
                  </span>
                </div>
              ) : tendered < billTotal ? (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Short</span>
                  <span className="text-amber-700 tabular-nums dark:text-amber-300">
                    {cashShortfall.toLocaleString()}
                  </span>
                </div>
              ) : (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Change</span>
                  <span className="text-green-700 tabular-nums dark:text-green-400">
                    0
                  </span>
                </div>
              )}
            </div>
          ) : payment ? (
            <p className="text-sm">
              Remaining:{" "}
              <span
                className={
                  cardRemaining === 0
                    ? "text-green-700 dark:text-green-400"
                    : "text-amber-700 dark:text-amber-300"
                }
              >
                {cardRemaining.toLocaleString()}
              </span>
            </p>
          ) : null}
        </div>
      </section>

      <div className="flex flex-wrap justify-end gap-2">
        {editingDraftId ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => void onDiscardDraft()}
          >
            Discard
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          disabled={!canHold || holding}
          onClick={() => void onHoldBill()}
        >
          {holding ? "Holding…" : "Hold bill"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            navigate(editingDraftId ? "/sales/held" : canReadList ? "/sales" : "/")
          }
        >
          Cancel
        </Button>
        <Button type="button" disabled={saving || !canPost} onClick={() => void onConfirm()}>
          {saving ? "Posting…" : "Post sale"}
        </Button>
      </div>

      <KeyboardHints
        hints={[KEYBOARD_HINT_ENTER, KEYBOARD_HINT_SCAN, KEYBOARD_HINT_SAVE]}
      />

      <ScanBarcodePanel
        open={scanOpen}
        onOpenChange={setScanOpen}
        busy={false}
        clearAfterComplete
        description={
          scanBusy
            ? "Looking up barcode…"
            : "Scan or type a barcode — rescanning the same SKU adds quantity."
        }
        onComplete={(code) => onBarcodeEnter(code)}
      />

      <ScanBarcodePanel
        open={removeScanOpen}
        onOpenChange={setRemoveScanOpen}
        title="Remove item"
        description="Scan the barcode of an item on this bill to remove it."
        clearAfterComplete
        onComplete={(code) => void onRemoveBarcodeEnter(code)}
      />

      <AddSaleItemDialog
        open={itemOpen}
        warehouseId={warehouseId}
        excludeDraftSaleId={editingDraftId}
        onClose={() => setItemOpen(false)}
        onAddMany={onAddManyFromDialog}
      />

      {tillSession && user ? (
        <CollectCashDialog
          open={collectDialogOpen}
          onOpenChange={setCollectDialogOpen}
          session={tillSession}
          cashierUserId={user.id}
          cashierName={user.fullName?.trim() || user.username}
          requireApproval={requireTillWithdrawApproval}
          onSuccess={setTillSession}
        />
      ) : null}
    </div>
  );
}
