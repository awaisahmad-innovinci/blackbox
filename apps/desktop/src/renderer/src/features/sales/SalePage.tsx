import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import type {
  SaleDetail,
  SalePaymentMethod,
  SaleReturnLookupSummary,
  SellUnit,
  SkuSearchResult,
  TillSessionDetail,
  WarehouseListItem,
} from "@blackbox/shared";
import {
  DEFAULT_SALE_CUSTOMER_NAME,
  formatMoney,
  isTillNearLimit,
  lineTotalAfterDiscount,
  maxCashTender,
  saleBillTotalsFromInclusiveLines,
  splitInclusiveGst,
  tillRemainingHeadroom,
} from "@blackbox/shared";
import { cn } from "@blackbox/ui/lib/utils";
import {
  FormEnterNav,
} from "@renderer/components/form-enter-nav";
import { ScanBarcodePanel } from "@renderer/components/scan-barcode-panel";
import { Button } from "@blackbox/ui/button";
import { Input } from "@blackbox/ui/input";
import { Label } from "@blackbox/ui/label";
import { Kbd } from "@blackbox/ui/kbd";
import { PriceTag } from "@blackbox/ui/price-tag";
import { ScanLine } from "lucide-react";
import { useConfirm } from "@renderer/components/confirm-provider";
import { removeTableLineConfirmOptions } from "@renderer/lib/confirm-remove-line";
import { useSupervisorTotp } from "@renderer/components/supervisor-totp-provider";
import {
  barcodeScanInputProps,
  handledScanEnterEvents,
  useBarcodeScanTarget,
} from "@renderer/lib/barcode-scan";
import { usePageKeyboard } from "@renderer/lib/use-page-keyboard";
import { getApiErrorMessage } from "@renderer/lib/api/client";
import {
  requireManagerFocApproval,
  requireManagerRemoveSaleLineApproval,
  requireManagerTillWithdrawApproval,
} from "@renderer/lib/manager-approval";
import { logActivityEvent } from "@renderer/lib/api/activity-logs";
import { salesApi } from "@renderer/lib/api/sales";
import { bumpDataVersion, syncNow, useSyncStatus } from "@renderer/lib/sync/sync-status";
import { submitPostedSaleToFbr } from "@renderer/lib/sales/submit-fbr";
import { resolveCardTerminalAmount } from "@renderer/features/sales/resolve-card-terminal-amount";
import { useCardTerminalAmountSync } from "@renderer/features/sales/use-card-terminal-amount-sync";
import { commitLocalChange, isDeviceBound } from "@renderer/lib/local-db/local-write";
import { loadSkuByBarcode, loadSale, loadWarehouses, loadPosAvailableForSale, lookupSkuByBarcode, lookupSaleReturn } from "@renderer/lib/local-db/entity-source";
import {
  applyTillCashFromSale,
  applyTillReturnCreditOnSale,
  assertTillCanPayRefund,
  assertTillCanPostSale,
  loadCurrentTill,
} from "@renderer/lib/local-db/till-source";
import { AddSaleItemDialog } from "./AddSaleItemDialog";
import { SaleKeyHintBar } from "./sale-key-hint-bar";
import {
  matchSaleKey,
  playScanErrorBeep,
  SALE_KEYS,
} from "./sale-keymap";
import { AdjustSaleQtyDialog } from "./AdjustSaleQtyDialog";
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
  gstPercent: number;
  hsCode: string | null;
  discountPercent: number;
  focQuantity: number;
  quantityCorrected?: boolean;
  lastScanMultiplier?: number;
};

type DraftPayment = {
  id: string;
  method: SalePaymentMethod;
  amount: number;
  reference: string;
};

type PaymentMode = "cash" | "card" | "split";

const NO_WAREHOUSE_ERROR = "No active warehouse configured";
const NOT_ON_BILL_ERROR = "This item is not on the current bill.";

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function lineUnitPrice(line: DraftSaleLine): number {
  if (line.sellingPrice > 0) return line.sellingPrice;
  const perBox = line.sellingPricePerPurchaseUnit;
  const units = line.unitsPerPurchaseUnit > 0 ? line.unitsPerPurchaseUnit : 1;
  if (perBox != null && perBox > 0 && units > 1) {
    return round4(perBox / units);
  }
  return line.sellingPrice;
}

function lineInventoryQty(line: DraftSaleLine): number {
  return round4(line.quantity + line.focQuantity);
}

function lineTotal(line: DraftSaleLine): number {
  return lineTotalAfterDiscount(
    line.quantity,
    lineUnitPrice(line),
    line.discountPercent,
  );
}

function lineGstSplit(line: DraftSaleLine): {
  exGstUnit: number;
  gstAmount: number;
  inclusiveTotal: number;
} {
  const inclusiveTotal = lineTotal(line);
  const { exGst, gstAmount } = splitInclusiveGst(inclusiveTotal, line.gstPercent);
  const exGstUnit =
    line.quantity > 0 ? round4(exGst / line.quantity) : round4(exGst);
  return { exGstUnit, gstAmount, inclusiveTotal };
}

function inferPaymentMode(rows: DraftPayment[]): PaymentMode {
  if (rows.length >= 2) {
    const hasCash = rows.some((row) => row.method === "CASH");
    const hasCard = rows.some((row) => row.method === "CARD");
    if (hasCash && hasCard) return "split";
  }
  if (rows[0]?.method === "CARD") return "card";
  return "cash";
}

function splitPaymentAmounts(
  rows: DraftPayment[],
  amountDue: number,
): { cash: number; card: number; cardReference: string } {
  const cashRow = rows.find((row) => row.method === "CASH");
  const cardRow = rows.find((row) => row.method === "CARD");
  const cash = round4(cashRow?.amount ?? 0);
  const card = round4(Math.max(0, amountDue - cash));
  return {
    cash,
    card,
    cardReference: cardRow?.reference ?? "",
  };
}

function buildSplitPayments(
  amountDue: number,
  cashAmount: number,
  cardReference: string,
  existingIds?: { cashId?: string; cardId?: string },
): DraftPayment[] {
  const cash = round4(Math.min(Math.max(0, cashAmount), amountDue));
  const card = round4(Math.max(0, amountDue - cash));
  return [
    {
      id: existingIds?.cashId ?? crypto.randomUUID(),
      method: "CASH",
      amount: cash,
      reference: "",
    },
    {
      id: existingIds?.cardId ?? crypto.randomUUID(),
      method: "CARD",
      amount: card,
      reference: cardReference,
    },
  ];
}

export function SalePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { draftId: routeDraftId } = useParams();
  const { user, offline } = useSession();
  const sync = useSyncStatus();
  const { canWrite, canReadTill, canManageTill } = useSalesAccess();
  const confirm = useConfirm();
  const { promptSupervisorTotp } = useSupervisorTotp();
  const requireTotp = requireManagerRemoveSaleLineApproval(user);
  const requireTillWithdrawApproval = requireManagerTillWithdrawApproval(user);
  const requireFocApproval = requireManagerFocApproval(user);

  const [warehouses, setWarehouses] = useState<WarehouseListItem[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [lines, setLines] = useState<DraftSaleLine[]>([]);
  // Latest rendered lines, so scan errors are decided outside setState updaters (review U7).
  const linesRef = useRef<DraftSaleLine[]>(lines);
  linesRef.current = lines;
  const [payments, setPayments] = useState<DraftPayment[]>([]);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("cash");
  const [scanDraft, setScanDraft] = useState("");
  const [itemOpen, setItemOpen] = useState(false);
  const [focItemOpen, setFocItemOpen] = useState(false);
  const [removeScanOpen, setRemoveScanOpen] = useState(false);
  const [adjustScanOpen, setAdjustScanOpen] = useState(false);
  const [adjustQtyOpen, setAdjustQtyOpen] = useState(false);
  const [adjustQtyLine, setAdjustQtyLine] = useState<DraftSaleLine | null>(null);
  const [adjustingQty, setAdjustingQty] = useState(false);
  const [showCustomerField, setShowCustomerField] = useState(false);
  const [scanBusy, setScanBusy] = useState(false);
  const [scanFlash, setScanFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [holding, setHolding] = useState(false);
  const [loadingDraft, setLoadingDraft] = useState(Boolean(routeDraftId));
  const [tillSession, setTillSession] = useState<TillSessionDetail | null>(null);
  const [collectDialogOpen, setCollectDialogOpen] = useState(false);
  const [appliedReturn, setAppliedReturn] =
    useState<SaleReturnLookupSummary | null>(null);
  const [returnEntry, setReturnEntry] = useState("");
  const [returnLookupBusy, setReturnLookupBusy] = useState(false);
  const editingDraftId = routeDraftId ?? null;
  const holdNumberRef = useRef<string | null>(null);
  const holdInFlightRef = useRef(false);
  const scanQueueRef = useRef<string[]>([]);
  const scanProcessingRef = useRef(false);
  const paymentsTouchedRef = useRef(false);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const paymentAmountRef = useRef<HTMLInputElement>(null);
  const splitCashAmountRef = useRef<HTMLInputElement>(null);

  const nonFbrSale =
    user?.fbrEnabled === true &&
    (user.permissions ?? []).includes("sales.non_fbr");

  const focusScanInput = useCallback(() => {
    requestAnimationFrame(() => {
      scanInputRef.current?.focus();
      scanInputRef.current?.select();
    });
  }, []);

  function resetForNewSale() {
    setLines([]);
    setPayments([]);
    setPaymentMode("cash");
    setCustomerName("");
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
  }, [user?.id, canManageTill, location.pathname]);

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
    if (loadingDraft || !warehouseId || itemOpen || focItemOpen || removeScanOpen || adjustScanOpen || adjustQtyOpen) return;
    focusScanInput();
  }, [loadingDraft, warehouseId, itemOpen, focItemOpen, removeScanOpen, adjustScanOpen, adjustQtyOpen, focusScanInput]);

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

        const draftLines: DraftSaleLine[] = await Promise.all(
          detail.items.map(async (item) => {
            let quantityAvailable = item.quantity + (item.focQuantity ?? 0);
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
              gstPercent: item.gstPercent ?? 0,
              hsCode: item.hsCode ?? null,
              discountPercent: item.discountPercent ?? 0,
              focQuantity: item.focQuantity ?? 0,
              quantityCorrected: item.quantityCorrected ?? false,
            };
          }),
        );
        setLines(draftLines);

        if (detail.payments.length > 0) {
          const draftPayments = detail.payments.map((row) => ({
            id: row.id,
            method: row.method,
            amount: row.amount,
            reference: row.reference,
          }));
          paymentsTouchedRef.current = true;
          setPaymentMode(inferPaymentMode(draftPayments));
          setPayments(draftPayments);
        } else {
          setPayments([]);
          setPaymentMode("cash");
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

  const billTotals = useMemo(
    () =>
      saleBillTotalsFromInclusiveLines(
        lines.map((line) => ({
          lineTotal: lineTotal(line),
          gstPercent: line.gstPercent,
        })),
      ),
    [lines],
  );

  const subtotal = billTotals.subtotal;
  const billTotal = billTotals.total;
  const billGstAmount = billTotals.gstAmount;
  const returnCredit = appliedReturn?.refundTotal ?? 0;
  const amountDue = round4(Math.max(0, billTotal - returnCredit));
  const cashBackFromCredit = round4(Math.max(0, returnCredit - billTotal));
  const isSplitPayment = paymentMode === "split";
  const payment = isSplitPayment ? null : (payments[0] ?? null);
  const splitAmounts = isSplitPayment
    ? splitPaymentAmounts(payments, amountDue)
    : null;
  const tendered = payment ? round4(payment.amount) : 0;
  const isCashPayment = paymentMode === "cash";
  const cashMaxTender = maxCashTender(amountDue > 0 ? amountDue : billTotal);
  const cashChange = isCashPayment
    ? round4(Math.max(0, tendered - amountDue))
    : 0;
  const cashShortfall = isCashPayment
    ? round4(Math.max(0, amountDue - tendered))
    : 0;
  const cardRemaining =
    paymentMode === "card" ? round4(amountDue - tendered) : 0;
  const cashOverMax = isCashPayment && amountDue > 0 && tendered > cashMaxTender;
  const splitCashOverDue =
    isSplitPayment &&
    splitAmounts != null &&
    splitAmounts.cash > amountDue;

  const cardTerminalAmount = useMemo(
    () =>
      resolveCardTerminalAmount(
        paymentMode,
        amountDue,
        payment,
        splitAmounts,
      ),
    [
      paymentMode,
      amountDue,
      payment?.amount,
      splitAmounts?.cash,
      splitAmounts?.card,
    ],
  );
  const cardTerminalStatus = useCardTerminalAmountSync({
    paymentMode,
    cardAmount: cardTerminalAmount,
    linesCount: lines.length,
  });

  function resolvedCashTendered(): number | null {
    if (paymentMode !== "cash" || !payment) return null;
    return tendered;
  }

  useEffect(() => {
    if (lines.length === 0) {
      setPayments([]);
      setPaymentMode("cash");
      paymentsTouchedRef.current = false;
      return;
    }
    if (paymentsTouchedRef.current) return;
    if (!(amountDue > 0)) {
      if (amountDue === 0 && appliedReturn) {
        setPayments([]);
      }
      return;
    }

    if (paymentMode === "split") {
      setPayments((prev) =>
        buildSplitPayments(
          amountDue,
          prev.find((row) => row.method === "CASH")?.amount ?? 0,
          prev.find((row) => row.method === "CARD")?.reference ?? "",
          {
            cashId: prev.find((row) => row.method === "CASH")?.id,
            cardId: prev.find((row) => row.method === "CARD")?.id,
          },
        ),
      );
      return;
    }

    if (paymentMode === "card") {
      setPayments((prev) => [
        {
          id: prev[0]?.id ?? crypto.randomUUID(),
          method: "CARD",
          amount: amountDue,
          reference: prev[0]?.reference ?? "",
        },
      ]);
      return;
    }

    setPayments((prev) => {
      if (prev.length !== 1) {
        return [
          {
            id: prev[0]?.id ?? crypto.randomUUID(),
            method: "CASH",
            amount: amountDue,
            reference: "",
          },
        ];
      }
      if (prev[0]!.method === "CASH" && !prev[0]!.reference.trim()) {
        return [{ ...prev[0]!, amount: amountDue }];
      }
      return prev;
    });
  }, [lines.length, amountDue, appliedReturn, paymentMode]);

  useEffect(() => {
    if (!isSplitPayment || !(amountDue > 0) || !paymentsTouchedRef.current) {
      return;
    }
    setPayments((prev) => {
      const cashRow = prev.find((row) => row.method === "CASH");
      const cardRow = prev.find((row) => row.method === "CARD");
      let cash = round4(cashRow?.amount ?? 0);
      if (cash > amountDue) cash = amountDue;
      const next = buildSplitPayments(
        amountDue,
        cash,
        cardRow?.reference ?? "",
        {
          cashId: cashRow?.id,
          cardId: cardRow?.id,
        },
      );
      const unchanged =
        next.length === prev.length &&
        next.every(
          (row, index) =>
            row.method === prev[index]?.method &&
            row.amount === prev[index]?.amount &&
            row.reference === prev[index]?.reference,
        );
      return unchanged ? prev : next;
    });
  }, [amountDue, isSplitPayment]);

  const canPost = useMemo(() => {
    if (lines.length === 0) return false;
    if (
      !lines.every(
        (line) =>
          (line.quantity > 0 || line.focQuantity > 0) &&
          lineInventoryQty(line) <= line.quantityAvailable,
      )
    ) {
      return false;
    }
    if (amountDue === 0) {
      return appliedReturn != null;
    }
    if (isSplitPayment) {
      if (!splitAmounts) return false;
      return (
        splitAmounts.cash > 0 &&
        splitAmounts.cash <= amountDue &&
        round4(splitAmounts.cash + splitAmounts.card) === amountDue
      );
    }
    if (!payment) return false;
    if (isCashPayment) {
      return tendered >= amountDue && tendered <= cashMaxTender;
    }
    return tendered === amountDue;
  }, [
    lines,
    payment,
    tendered,
    amountDue,
    cashMaxTender,
    appliedReturn,
    isSplitPayment,
    splitAmounts,
    isCashPayment,
  ]);

  const canHold = lines.length > 0 && !loadingDraft;

  function buildDetailFromForm(options: {
    id: string;
    saleNumber: string;
    status: SaleDetail["status"];
    postedAt?: string | null;
  }): SaleDetail {
    const warehouseName =
      warehouses.find((warehouse) => warehouse.id === warehouseId)?.name ?? "";
    const gst = 0;
    const salesTax = 0;
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
        discountPercent: line.discountPercent,
        focQuantity: line.focQuantity,
        unitPrice,
        lineTotal: lineTotal(line),
        gstPercent: line.gstPercent,
        hsCode: line.hsCode,
        sellUnit: line.sellUnit,
        ...(line.quantityCorrected ? { quantityCorrected: true } : {}),
      };
    });
    const paymentRows = postedPaymentRows();

    return {
      id: options.id,
      saleNumber: options.saleNumber,
      warehouseId,
      warehouseName,
      status: options.status,
      subtotal,
      gstRate: gst,
      gstAmount: billGstAmount,
      salesTaxRate: salesTax,
      salesTaxAmount: 0,
      total: billTotal,
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

  function postedPaymentRows(): SaleDetail["payments"] {
    if (amountDue <= 0) return [];
    if (isSplitPayment && splitAmounts) {
      const cashRow = payments.find((row) => row.method === "CASH");
      const cardRow = payments.find((row) => row.method === "CARD");
      return [
        {
          id: cashRow?.id ?? crypto.randomUUID(),
          method: "CASH",
          amount: splitAmounts.cash,
          reference: "",
        },
        {
          id: cardRow?.id ?? crypto.randomUUID(),
          method: "CARD",
          amount: splitAmounts.card,
          reference: splitAmounts.cardReference.trim(),
        },
      ];
    }
    if (!payment) return [];
    const postedAmount =
      paymentMode === "cash" ? amountDue : round4(payment.amount);
    return [
      {
        id: payment.id,
        method: payment.method,
        amount: postedAmount,
        reference: payment.reference.trim(),
      },
    ];
  }

  async function lookupReturnVoucher(code: string) {
    const trimmed = code.trim();
    if (!trimmed) return;
    setReturnLookupBusy(true);
    setError(null);
    try {
      const summary = await lookupSaleReturn(trimmed);
      setAppliedReturn(summary);
      setReturnEntry("");
      paymentsTouchedRef.current = false;
    } catch (err: unknown) {
      setAppliedReturn(null);
      setError(getApiErrorMessage(err, "Return voucher not found"));
    } finally {
      setReturnLookupBusy(false);
    }
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

    const current = linesRef.current.find((line) => line.productSkuId === row.id);
    const scanError =
      (current
        ? round4(current.quantity + multiplier) + current.focQuantity > available
        : multiplier > available)
        ? `Cannot exceed POS balance (${available}) for ${row.sku}`
        : null;
    if (scanError) return scanError;

    setLines((prev) => {
      const existing = prev.find((line) => line.productSkuId === row.id);
      if (existing) {
        const nextQty = round4(existing.quantity + multiplier);
        // Still guarded here for several scans landing in one render.
        if (nextQty + existing.focQuantity > available) return prev;
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

      if (multiplier > available) return prev;

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
          gstPercent: row.gstPercent ?? 0,
          hsCode: row.hsCode ?? null,
          discountPercent: row.saleDiscountPercent ?? 0,
          focQuantity: 0,
          lastScanMultiplier: multiplier,
        },
      ];
    });

    focusScanInput();
    return null;
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

  /**
   * Add a product the customer did not buy as a FOC-only line
   * (qty 0, nothing billed, FOC qty deducted from POS floor stock).
   * If the SKU is already on the bill, bump its FOC by 1 instead.
   */
  function upsertFocLine(row: SkuSearchResult): string | null {
    const available = row.quantityAvailable ?? 0;
    if (available <= 0) {
      return `No POS balance for ${row.sku}`;
    }

    const current = linesRef.current.find((line) => line.productSkuId === row.id);
    if (current && round4(current.quantity + current.focQuantity + 1) > available) {
      return `Cannot exceed POS balance (${available}) for ${row.sku}`;
    }

    setLines((prev) => {
      const existing = prev.find((line) => line.productSkuId === row.id);
      if (existing) {
        const nextFoc = existing.focQuantity + 1;
        if (round4(existing.quantity + nextFoc) > available) return prev;
        return prev.map((line) =>
          line.productSkuId === row.id
            ? { ...line, focQuantity: nextFoc }
            : line,
        );
      }

      return [
        ...prev,
        {
          productSkuId: row.id,
          productName: row.productName,
          variantName: row.variantName,
          sku: row.sku,
          barcode: row.barcode,
          quantity: 0,
          quantityAvailable: available,
          sellUnit: "pc",
          unitsPerPurchaseUnit: row.unitsPerPurchaseUnit ?? 1,
          sellingPrice: row.sellingPrice ?? 0,
          sellingPricePerPurchaseUnit: row.sellingPricePerPurchaseUnit ?? null,
          gstPercent: row.gstPercent ?? 0,
          hsCode: row.hsCode ?? null,
          discountPercent: row.saleDiscountPercent ?? 0,
          focQuantity: 1,
          lastScanMultiplier: 1,
        },
      ];
    });

    return null;
  }

  function onAddManyFocFromDialog(rows: SkuSearchResult[]) {
    if (!warehouseId) {
      setError(NO_WAREHOUSE_ERROR);
      return;
    }
    let lastError: string | null = null;
    for (const row of rows) {
      const err = upsertFocLine(row);
      if (err) lastError = err;
    }
    setError(lastError);
    setFocItemOpen(false);
  }

  function signalScanError(): void {
    playScanErrorBeep();
    setScanFlash(true);
    window.setTimeout(() => setScanFlash(false), 700);
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
          if (err) {
            setError(err);
            signalScanError();
          }
        } catch (err: unknown) {
          setError(getApiErrorMessage(err, "SKU not found for barcode"));
          signalScanError();
        }
      }
    } finally {
      scanProcessingRef.current = false;
      setScanBusy(false);
      // Draft is already cleared on Enter; clearing here would drop a scan typed meanwhile.
      focusScanInput();
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

  useBarcodeScanTarget({
    kind: "barcode",
    layer: "main",
    enabled:
      !loadingDraft &&
      !itemOpen &&
      !focItemOpen &&
      !removeScanOpen &&
      !adjustScanOpen &&
      !adjustQtyOpen &&
      Boolean(warehouseId),
    inputRef: scanInputRef,
    onScan: setScanDraft,
    onComplete: (code) => {
      setScanDraft("");
      onBarcodeEnter(code);
    },
  });

  function handleScanFieldEnter(): void {
    const code = scanDraft.trim();
    if (!code) return;
    setScanDraft("");
    onBarcodeEnter(code);
  }

  function updateLineFoc(line: DraftSaleLine, raw: string): void {
    const focQuantity = Math.max(
      0,
      Math.floor(parseNumericInputChange(raw)),
    );
    if (line.quantity === 0 && focQuantity < 1) {
      setError(
        `FOC-only line must have at least 1 FOC for ${line.sku}; remove the line instead`,
      );
      return;
    }
    const invQty = round4(line.quantity + focQuantity);
    if (invQty > line.quantityAvailable) {
      setError(
        `Cannot exceed POS balance (${line.quantityAvailable}) for ${line.sku}`,
      );
      return;
    }
    setError(null);
    setLines((prev) =>
      prev.map((row) =>
        row.productSkuId === line.productSkuId ? { ...row, focQuantity } : row,
      ),
    );
  }

  function selectPaymentMode(mode: PaymentMode): void {
    if (!(amountDue > 0) && mode !== "cash") return;
    paymentsTouchedRef.current = true;
    setPaymentMode(mode);
    if (mode === "split") {
      const cardReference =
        payments.find((row) => row.method === "CARD")?.reference ?? "";
      setPayments(
        buildSplitPayments(amountDue, 0, cardReference, {
          cashId: payments.find((row) => row.method === "CASH")?.id,
          cardId: payments.find((row) => row.method === "CARD")?.id,
        }),
      );
      return;
    }
    if (mode === "card") {
      setPayments([
        {
          id: payments[0]?.id ?? crypto.randomUUID(),
          method: "CARD",
          amount: amountDue,
          reference: payments[0]?.reference ?? "",
        },
      ]);
      return;
    }
    setPayments([
      {
        id: payments[0]?.id ?? crypto.randomUUID(),
        method: "CASH",
        amount: amountDue,
        reference: "",
      },
    ]);
  }

  function updateSplitCashAmount(raw: string): void {
    const cash = round4(Math.max(0, parseNumericInputChange(raw)));
    paymentsTouchedRef.current = true;
    const cardReference =
      payments.find((row) => row.method === "CARD")?.reference ?? "";
    const card = round4(Math.max(0, amountDue - cash));
    setPayments([
      {
        id:
          payments.find((row) => row.method === "CASH")?.id ??
          crypto.randomUUID(),
        method: "CASH",
        amount: cash,
        reference: "",
      },
      {
        id:
          payments.find((row) => row.method === "CARD")?.id ??
          crypto.randomUUID(),
        method: "CARD",
        amount: card,
        reference: cardReference,
      },
    ]);
  }

  function updateSplitCardReference(reference: string): void {
    paymentsTouchedRef.current = true;
    setPayments((prev) =>
      prev.map((row) =>
        row.method === "CARD" ? { ...row, reference } : row,
      ),
    );
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

  async function onRemoveBarcodeEnter(scannedCode: string) {
    setError(null);
    const code = scannedCode.trim();
    if (!code) return;

    const line = await resolveLineForRemoveScan(code);
    if (!line) {
      setError(NOT_ON_BILL_ERROR);
      return;
    }
    const removed = await removeBillLine(line, { confirm: false });
    if (removed) {
      setRemoveScanOpen(false);
      focusScanInput();
    }
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

  function openAdjustQtyDialog(line: DraftSaleLine): void {
    if (line.quantity === 0) {
      setError("FOC-only line has no billed quantity to adjust");
      return;
    }
    setAdjustQtyLine(line);
    setAdjustQtyOpen(true);
    setError(null);
  }

  async function onAdjustBarcodeEnter(scannedCode: string) {
    setError(null);
    const code = scannedCode.trim();
    if (!code) return;

    const line = await resolveLineForRemoveScan(code);
    if (!line) {
      setError(NOT_ON_BILL_ERROR);
      return;
    }
    setAdjustScanOpen(false);
    openAdjustQtyDialog(line);
  }

  async function adjustBillLineQuantity(
    line: DraftSaleLine,
    newQuantity: number,
  ): Promise<boolean> {
    if (newQuantity >= line.quantity || newQuantity <= 0) {
      setError("New quantity must be less than current and greater than zero");
      return false;
    }
    if (round4(newQuantity + line.focQuantity) > line.quantityAvailable) {
      setError(
        `Cannot exceed POS balance (${line.quantityAvailable}) for ${line.sku}`,
      );
      return false;
    }

    let supervisorUserId: string | null = null;
    let supervisorDisplayName: string | null = null;
    if (requireTotp) {
      const totp = await promptSupervisorTotp();
      if (!totp.approved) return false;
      supervisorUserId = totp.supervisorUserId;
      supervisorDisplayName = totp.supervisorDisplayName;
    }

    const oldQuantity = line.quantity;
    setLines((prev) =>
      prev.map((row) =>
        row.productSkuId === line.productSkuId
          ? {
              ...row,
              quantity: round4(newQuantity),
              quantityCorrected: true,
            }
          : row,
      ),
    );

    if (user?.id) {
      const actorName = user.fullName?.trim() || user.username;
      await logActivityEvent(
        {
          eventType: "sale.line_qty_adjusted",
          actorUserId: user.id,
          supervisorUserId,
          summary: `Adjusted ${line.sku} qty ${oldQuantity} → ${newQuantity}`,
          metadata: {
            sku: line.sku,
            productName: line.productName,
            variantName: line.variantName,
            oldQuantity,
            newQuantity,
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
      bumpDataVersion();
      resetForNewSale();
      navigate("/sales/new", { replace: true });
      setHolding(false);
      holdInFlightRef.current = false;
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Failed to hold bill"));
      setHolding(false);
      holdInFlightRef.current = false;
    }
  }

  const tillBlocked =
    !canManageTill && !loadingDraft && tillSession?.status !== "OPEN";

  const tillNearLimit =
    tillSession != null &&
    !canManageTill &&
    !tillBlocked &&
    isTillNearLimit(tillSession);

  const cashierCanWithdrawCash =
    !canManageTill &&
    tillSession != null &&
    (tillSession.status === "OPEN" || tillSession.status === "CLOSED_LIMIT");

  const tillLimitWithdrawHint =
    requireTillWithdrawApproval
      ? "Use Withdraw cash — a manager must authorize with an authentication code first."
      : "Use Withdraw cash to remove enough cash; the till reopens for sales when below the limit.";

  async function onConfirm() {
    setError(null);
    if (!warehouseId) {
      setError(NO_WAREHOUSE_ERROR);
      return;
    }
    if (!canPost) {
      setError(
        amountDue === 0 && appliedReturn
          ? "Return credit covers the bill — confirm to pay cash back from till"
          : isSplitPayment
            ? "Enter a cash amount greater than zero and not more than the amount due"
            : isCashPayment
              ? "Enter cash tender at least equal to the amount due (within max limit)"
              : "Payment amount must match the amount due",
      );
      return;
    }
    if (tillBlocked) {
      setError(
        tillSession?.status === "CLOSED_LIMIT"
          ? `Till cash limit reached. ${tillLimitWithdrawHint}`
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
        if (cashBackFromCredit > 0) {
          await assertTillCanPayRefund({
            userId: user.id,
            skipForManager: canManageTill,
            refundAmount: cashBackFromCredit,
          });
        }
      } catch (err: unknown) {
        setError(getApiErrorMessage(err, "Till is not ready for this sale"));
        return;
      }
    }

    const focLines = lines.filter((line) => line.focQuantity > 0);
    let focSupervisorUserId: string | null = null;
    let focSupervisorDisplayName: string | null = null;
    if (focLines.length > 0 && requireFocApproval) {
      const totp = await promptSupervisorTotp();
      if (!totp.approved) return;
      focSupervisorUserId = totp.supervisorUserId;
      focSupervisorDisplayName = totp.supervisorDisplayName;
    }

    setSaving(true);
    try {
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
            discountPercent: line.discountPercent,
            focQuantity: line.focQuantity,
            unitPrice,
            lineTotal: lineTotal(line),
            gstPercent: line.gstPercent,
            hsCode: line.hsCode,
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
          gstRate: 0,
          gstAmount: billGstAmount,
          salesTaxRate: 0,
          salesTaxAmount: 0,
          total: billTotal,
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
          ...(user?.fbrEnabled
            ? {
                fbrStatus: nonFbrSale
                  ? ("excluded" as const)
                  : ("pending" as const),
              }
            : {}),
        };

        await commitLocalChange({
          entityType: "sale",
          entityId: localId,
          operation: "UPSERT",
          payload: detail as unknown as Record<string, unknown>,
        });

        for (const item of items) {
          const invQty = round4(item.quantity + item.focQuantity);
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
              quantity: invQty,
              delta: -invQty,
              referenceType: "sale",
              referenceId: localId,
              reason: `Sale ${saleNumber}`,
              createdAt: now,
            },
          });
        }

        if (user?.id) {
          if (focLines.length > 0 && focSupervisorUserId) {
            await logActivityEvent(
              {
                eventType: "sale.foc_posted",
                actorUserId: user.id,
                supervisorUserId: focSupervisorUserId,
                summary: `${focSupervisorDisplayName ?? "Manager"} approved FOC sale ${saleNumber}`,
                metadata: {
                  saleNumber,
                  saleId: localId,
                  focLineCount: focLines.length,
                },
              },
              {
                actorName: user.fullName?.trim() || user.username,
                supervisorName: focSupervisorDisplayName,
              },
            );
          }
          if (appliedReturn) {
            await applyTillReturnCreditOnSale({
              userId: user.id,
              skipForManager: canManageTill,
              cashPaymentTotal,
              cashBackFromCredit,
            });
            const completedReturn =
              await window.blackbox!.localDb!.completeSaleReturnWithSale!({
                returnId: appliedReturn.id,
                saleId: localId,
                userId: user.id,
                userName: resolvedCashierName,
              });
            await commitLocalChange({
              entityType: "sale_return",
              entityId: completedReturn.id,
              operation: "UPSERT",
              payload: completedReturn as unknown as Record<string, unknown>,
            });
            await logActivityEvent(
              {
                eventType: "sale.return_refunded",
                actorUserId: user.id,
                summary: `${resolvedCashierName} refunded return ${completedReturn.returnNumber} — Rs ${formatMoney(completedReturn.refundTotal)} cash`,
                metadata: {
                  returnNumber: completedReturn.returnNumber,
                  returnId: completedReturn.id,
                  refundTotal: completedReturn.refundTotal,
                  issuedByName: appliedReturn.issuedByName,
                  appliedToSaleId: localId,
                  completionMode: "SALE_OFFSET",
                },
              },
              { actorName: resolvedCashierName },
            );
          } else {
            await applyTillCashFromSale({
              userId: user.id,
              skipForManager: canManageTill,
              cashPaymentTotal,
            });
          }
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
        if (editingDraftId) {
          try {
            await window.blackbox?.localDb?.deleteSaleDraft?.(editingDraftId);
          } catch {
            /* draft cleanup is best-effort */
          }
        }
        const registerOffline =
          offline ||
          sync.offline ||
          (typeof navigator !== "undefined" && navigator.onLine === false);
        const withFbr =
          user?.fbrEnabled && !nonFbrSale && !registerOffline
            ? await submitPostedSaleToFbr(detail)
            : detail;
        if (user?.id) {
          await logActivityEvent(
            {
              eventType: "sale.posted",
              actorUserId: user.id,
              summary: `Posted sale ${withFbr.saleNumber} for Rs ${formatMoney(withFbr.total)}`,
              metadata: {
                saleId: withFbr.id,
                saleNumber: withFbr.saleNumber,
                total: withFbr.total,
              },
            },
            { actorName: user.fullName?.trim() || user.username },
          );
        }
        navigate(`/sales/${withFbr.id}`, { state: { printBill: true } });
        void syncNow();
        return;
      }

      const detail = await salesApi.create({
        warehouseId,
        customerName: resolvedCustomerName,
        cashTendered: resolvedCashTendered() ?? undefined,
        supervisorUserId: focSupervisorUserId ?? undefined,
        pendingReturnId: appliedReturn?.id,
        items: lines.map((line) => ({
          productSkuId: line.productSkuId,
          quantity: line.quantity,
          discountPercent: line.discountPercent,
          focQuantity: line.focQuantity,
          unitPrice: lineUnitPrice(line),
          lineTotal: lineTotal(line),
          gstPercent: line.gstPercent,
          hsCode: line.hsCode,
          sellUnit: line.sellUnit,
          barcode: line.barcode,
        })),
        payments: postedPaymentRows().map((row) => ({
          method: row.method,
          amount: row.amount,
          reference: row.reference || undefined,
        })),
      });

      if (focLines.length > 0 && focSupervisorUserId && user?.id) {
        await logActivityEvent(
          {
            eventType: "sale.foc_posted",
            actorUserId: user.id,
            supervisorUserId: focSupervisorUserId,
            summary: `${focSupervisorDisplayName ?? "Manager"} approved FOC sale ${detail.saleNumber}`,
            metadata: {
              saleNumber: detail.saleNumber,
              saleId: detail.id,
              focLineCount: focLines.length,
            },
          },
          {
            actorName: user.fullName?.trim() || user.username,
            supervisorName: focSupervisorDisplayName,
          },
        );
      }

      if (editingDraftId) {
        try {
          await window.blackbox?.localDb?.deleteSaleDraft?.(editingDraftId);
        } catch {
          /* draft cleanup is best-effort */
        }
      }

      const withFbr =
        user?.fbrEnabled && !nonFbrSale
          ? await submitPostedSaleToFbr(detail)
          : detail;
      bumpDataVersion();
      navigate(`/sales/${withFbr.id}`, { state: { printBill: true } });
      void syncNow();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Failed to post sale"));
    } finally {
      setSaving(false);
    }
  }

  usePageKeyboard({
    enabled: !loadingDraft,
    onSave: () => {
      if (!saving && canPost) void onConfirm();
    },
    onScan: focusScanInput,
    onAddItem: () => {
      if (warehouseId && !itemOpen && !scanBusy) setItemOpen(true);
    },
  });

  useEffect(() => {
    if (loadingDraft) return;

    function onKeyDown(event: KeyboardEvent): void {
      const action = matchSaleKey(event);
      if (!action) return;
      event.preventDefault();
      switch (action) {
        case "remove":
          if (lines.length > 0) setRemoveScanOpen(true);
          return;
        case "adjust":
          if (lines.length > 0) setAdjustScanOpen(true);
          return;
        case "hold":
          if (canHold && !holding) void onHoldBill();
          return;
        case "held":
          navigate("/sales/held");
          return;
        case "foc":
          if (warehouseId && !itemOpen && !focItemOpen && !scanBusy) {
            setFocItemOpen(true);
          }
          return;
        case "tender":
          if (isSplitPayment) {
            splitCashAmountRef.current?.focus();
            splitCashAmountRef.current?.select();
          } else {
            paymentAmountRef.current?.focus();
            paymentAmountRef.current?.select();
          }
          return;
        case "split":
          if (amountDue > 0) selectPaymentMode("split");
          return;
        case "cash":
          if (amountDue > 0) selectPaymentMode("cash");
          return;
        case "card":
          if (amountDue > 0) selectPaymentMode("card");
          return;
      }
    }

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [loadingDraft, canHold, holding, navigate, payment, billTotal, lines.length, amountDue, isSplitPayment, warehouseId, itemOpen, focItemOpen, scanBusy]);

  if (loadingDraft) {
    return <p className="text-muted-foreground text-sm">Loading held bill…</p>;
  }

  const tillStatusLabel =
    canManageTill || !tillSession
      ? null
      : tillSession.status === "OPEN"
        ? "Till open"
        : tillSession.status === "PENDING_APPROVAL"
          ? "Till pending"
          : tillSession.status === "CLOSED_LIMIT"
            ? "Till limit"
            : "Till closed";

  const syncLabel = sync.syncing
    ? "Syncing…"
    : sync.lastError
      ? "Sync issue"
      : offline
        ? "Offline"
        : "Online";

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col gap-4">
      <div className="border-border bg-card flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-2 text-sm">
        <dl className="flex flex-wrap items-center gap-x-5 gap-y-1">
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Store</dt>
            <dd className="font-semibold">{user?.tenantName?.trim() || "Store"}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt className="text-muted-foreground">Cashier</dt>
            <dd>{user?.fullName?.trim() || user?.username || "Cashier"}</dd>
          </div>
          {tillStatusLabel ? (
            <div className="flex items-center gap-1.5">
              <dt className="sr-only">Till</dt>
              <dd
                className={cn(
                  "font-medium",
                  tillBlocked && "text-destructive",
                  tillNearLimit && !tillBlocked && "text-warning",
                )}
              >
                {tillStatusLabel}
              </dd>
            </div>
          ) : null}
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Sync</dt>
            <dd className="flex items-center gap-1.5">
              <span
                aria-hidden
                className={cn(
                  "size-2 rounded-full",
                  sync.lastError
                    ? "bg-destructive"
                    : offline
                      ? "bg-warning"
                      : sync.syncing
                        ? "bg-info animate-pulse"
                        : "bg-success",
                )}
              />
              <span
                className={cn(
                  sync.lastError && "text-destructive",
                  offline && !sync.lastError && "text-warning",
                )}
              >
                {syncLabel}
              </span>
            </dd>
          </div>
        </dl>
        <div className="flex flex-wrap items-center gap-2">
          {editingDraftId ? (
            <span className="text-muted-foreground text-xs">
              {holdNumberRef.current ?? "Held bill"}
            </span>
          ) : null}
          {cashierCanWithdrawCash ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setCollectDialogOpen(true)}
            >
              Withdraw cash
            </Button>
          ) : null}
          {canReadTill && !canManageTill ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => navigate("/sales/till")}
            >
              My till
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
            ? `Till cash limit reached — sales are paused. ${tillLimitWithdrawHint}`
            : tillSession?.status === "PENDING_APPROVAL"
              ? "Till is pending manager approval."
              : "Open your till before posting sales."}{" "}
          {tillSession?.status === "CLOSED_LIMIT" ? (
            <Button
              type="button"
              variant="link"
              className="text-destructive h-auto p-0"
              onClick={() => setCollectDialogOpen(true)}
            >
              Withdraw cash
            </Button>
          ) : (
            <Button
              type="button"
              variant="link"
              className="text-destructive h-auto p-0"
              onClick={() => navigate("/sales/till")}
            >
              Go to My till
            </Button>
          )}
        </div>
      ) : null}

      {tillNearLimit ? (
        <div
          role="status"
          className="border-warning/40 bg-warning/10 text-foreground rounded-lg border px-4 py-3 text-sm"
        >
          Till is near the cash limit — Rs{" "}
          {formatMoney(tillRemainingHeadroom(tillSession!))} headroom left.
          You can still complete this sale even if cash exceeds the limit; the
          till will close afterward and a manager must collect cash before more
          sales.
        </div>
      ) : null}

      {error ? (
        <p
          className="border-destructive/30 bg-destructive/5 text-destructive rounded-lg border px-4 py-2.5 text-sm font-medium"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(22rem,2fr)]">
        <div className="flex min-h-0 flex-col gap-3">
          <div className="space-y-2">
            <Label htmlFor="saleScanInput" className="sr-only">
              Scan barcode
            </Label>
            <div className="relative">
            <ScanLine
              aria-hidden
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2"
            />
            <Input
              ref={scanInputRef}
              id="saleScanInput"
              {...barcodeScanInputProps()}
              autoComplete="off"
              disabled={!warehouseId}
              placeholder={
                scanBusy
                  ? "Looking up barcode…"
                  : "Scan barcode or search product / SKU…"
              }
              value={scanDraft}
              onChange={(event) => setScanDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                event.stopPropagation();
                // The scan hook already handled this Enter (codes of 3+ chars).
                if (handledScanEnterEvents.has(event.nativeEvent)) return;
                handleScanFieldEnter();
              }}
              aria-invalid={scanFlash || undefined}
              className={cn(
                "bg-card h-14 pl-11 text-lg transition-shadow",
                scanFlash && "border-destructive ring-destructive/40 ring-4",
              )}
            />
            </div>
            <p className="text-muted-foreground text-xs">
              Scanning the same item again adds one more. Press{" "}
              <Kbd>{SALE_KEYS.scan.key}</Kbd> to come back to this field.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!warehouseId || itemOpen || scanBusy}
              onClick={() => setItemOpen(true)}
            >
              {SALE_KEYS.addItem.label} <Kbd>{SALE_KEYS.addItem.key}</Kbd>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!warehouseId || itemOpen || focItemOpen || scanBusy}
              onClick={() => setFocItemOpen(true)}
            >
              {SALE_KEYS.foc.label} <Kbd>{SALE_KEYS.foc.key}</Kbd>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={lines.length === 0}
              onClick={() => setRemoveScanOpen(true)}
            >
              {SALE_KEYS.remove.label} <Kbd>{SALE_KEYS.remove.key}</Kbd>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={lines.length === 0}
              onClick={() => setAdjustScanOpen(true)}
            >
              {SALE_KEYS.adjust.label} <Kbd>{SALE_KEYS.adjust.key}</Kbd>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!canHold || holding}
              onClick={() => void onHoldBill()}
            >
              {holding ? "Holding…" : SALE_KEYS.hold.label}{" "}
              <Kbd>{SALE_KEYS.hold.key}</Kbd>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowCustomerField((v) => !v)}
            >
              {showCustomerField ? "Hide customer" : "Customer"}
            </Button>
          </div>

          {showCustomerField ? (
            <div className="space-y-2">
              <Label htmlFor="customerName">Customer name</Label>
              <Input
                id="customerName"
                placeholder="Optional"
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
              />
            </div>
          ) : null}

          <div className="border-border bg-card min-h-0 flex-1 overflow-auto rounded-lg border">
            <table className="w-full text-left text-sm tabular-nums">
              <thead className="bg-muted text-muted-foreground sticky top-0 z-10 text-xs">
                <tr>
                  <th className="px-3 py-2 font-medium">Product</th>
                  <th className="px-3 py-2 font-medium">Qty</th>
                  <th className="px-3 py-2 font-medium">Disc %</th>
                  <th className="px-3 py-2 font-medium">FOC</th>
                  <th className="px-3 py-2 text-right font-medium">Price</th>
                  <th className="px-3 py-2 text-right font-medium">GST</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                  <th className="px-3 py-2 w-10" />
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="text-muted-foreground px-3 py-16 text-center"
                    >
                      Scan a barcode to start the sale
                    </td>
                  </tr>
                ) : (
                  lines.map((line) => {
                    const split = lineGstSplit(line);
                    return (
                    <tr
                      key={line.productSkuId}
                      className="border-border border-t"
                    >
                      <td className="px-3 py-2">
                        <p className="font-medium">
                          {line.productName}
                          {line.variantName ? ` · ${line.variantName}` : ""}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {line.sku}
                          {line.barcode ? ` · ${line.barcode}` : ""}
                        </p>
                        {lineInventoryQty(line) > line.quantityAvailable ? (
                          <p className="text-destructive text-xs">
                            Max {line.quantityAvailable} (qty + FOC)
                          </p>
                        ) : null}
                        {line.quantityCorrected ? (
                          <p className="text-muted-foreground text-xs">
                            Qty corrected
                          </p>
                        ) : null}
                        {line.quantity === 0 ? (
                          <p className="text-muted-foreground text-xs">
                            FOC only · not billed
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        <div className="flex items-center gap-2">
                          <span>{line.quantity.toLocaleString()}</span>
                          {line.quantity > 0 ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-muted-foreground h-7 px-2 text-xs"
                              onClick={() => openAdjustQtyDialog(line)}
                            >
                              Adjust
                            </Button>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {line.discountPercent.toLocaleString()}
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          min={0}
                          step={1}
                          className="h-8 w-16 px-1 text-center tabular-nums"
                          value={numericInputDisplayValue(line.focQuantity)}
                          onFocus={selectZeroNumericOnFocus}
                          onKeyDown={replaceLeadingZeroOnKeyDown}
                          onChange={(event) =>
                            updateLineFoc(line, event.target.value)
                          }
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        {formatMoney(split.exGstUnit)}
                      </td>
                      <td className="text-muted-foreground px-3 py-2 text-right">
                        {formatMoney(split.gstAmount)}
                      </td>
                      <td className="px-3 py-2 text-right text-base font-semibold">
                        {formatMoney(split.inclusiveTotal)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          aria-label="Remove line"
                          onClick={() => {
                            void removeBillLine(line, { confirm: true });
                          }}
                        >
                          ×
                        </Button>
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="border-border bg-card lg:sticky lg:top-20 lg:self-start space-y-5 rounded-lg border p-5">
          <div>
            <p className="text-muted-foreground text-xs">Invoice</p>
            <p className="text-lg font-semibold">
              {editingDraftId
                ? holdNumberRef.current ?? "Held bill"
                : "New sale"}
            </p>
          </div>

          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="tabular-nums">{formatMoney(subtotal)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">GST</span>
              <span className="tabular-nums">
                {formatMoney(billGstAmount)}
              </span>
            </div>
            <div className="border-border flex items-end justify-between gap-4 border-t pt-4">
              <span className="text-base font-semibold">Total</span>
              <PriceTag size={appliedReturn ? "lg" : "xl"} aria-live="polite">
                {formatMoney(billTotal)}
              </PriceTag>
            </div>
            {appliedReturn ? (
              <>
                <div className="flex justify-between gap-4 text-sm">
                  <span className="text-muted-foreground">
                    Return credit ({appliedReturn.returnNumber})
                  </span>
                  <span className="text-success font-medium tabular-nums">
                    −{formatMoney(returnCredit)}
                  </span>
                </div>
                {cashBackFromCredit > 0 ? (
                  <div className="flex justify-between gap-4 text-sm">
                    <span className="text-muted-foreground">Cash back</span>
                    <span className="font-medium tabular-nums">
                      {formatMoney(cashBackFromCredit)}
                    </span>
                  </div>
                ) : null}
                <div className="border-border flex items-end justify-between gap-4 border-t pt-4">
                  <span className="text-base font-semibold">Amount due</span>
                  <PriceTag size="xl" aria-live="polite">
                    {formatMoney(amountDue)}
                  </PriceTag>
                </div>
              </>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="returnVoucherEntry">Return voucher (optional)</Label>
            <div className="flex gap-2">
              <Input
                id="returnVoucherEntry"
                placeholder="Scan or enter return #"
                value={returnEntry}
                disabled={returnLookupBusy}
                onChange={(event) => setReturnEntry(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void lookupReturnVoucher(returnEntry);
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                disabled={returnLookupBusy || !returnEntry.trim()}
                onClick={() => void lookupReturnVoucher(returnEntry)}
              >
                Apply
              </Button>
              {appliedReturn ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setAppliedReturn(null);
                    paymentsTouchedRef.current = false;
                  }}
                >
                  Clear
                </Button>
              ) : null}
            </div>
          </div>

          <FormEnterNav>
            <div className="space-y-3">
              <h2 className="text-sm font-medium">Payment</h2>
              {cardTerminalStatus.state === "sent" ? (
                <p className="text-muted-foreground text-xs">
                  Card terminal: {formatMoney(cardTerminalStatus.amount)}{" "}
                  sent
                </p>
              ) : cardTerminalStatus.state === "error" ? (
                <p className="text-destructive text-xs" role="alert">
                  {cardTerminalStatus.message} Enter amount on the terminal
                  manually if needed.
                </p>
              ) : null}
              {amountDue > 0 && (payment || isSplitPayment) ? (
                <>
                  <div className="space-y-2">
                    <Label>Method</Label>
                    <div className="grid grid-cols-3 gap-2">
                      <Button
                        type="button"
                        variant={
                          paymentMode === "cash" ? "default" : "outline"
                        }
                        className="h-auto flex-col gap-0.5 py-2"
                        onClick={() => selectPaymentMode("cash")}
                      >
                        <span>{SALE_KEYS.cash.label}</span>
                        <span className="text-[0.7rem] opacity-70">{SALE_KEYS.cash.key}</span>
                      </Button>
                      <Button
                        type="button"
                        variant={
                          paymentMode === "card" ? "default" : "outline"
                        }
                        className="h-auto flex-col gap-0.5 py-2"
                        onClick={() => selectPaymentMode("card")}
                      >
                        <span>{SALE_KEYS.card.label}</span>
                        <span className="text-[0.7rem] opacity-70">{SALE_KEYS.card.key}</span>
                      </Button>
                      <Button
                        type="button"
                        variant={
                          paymentMode === "split" ? "default" : "outline"
                        }
                        className="h-auto flex-col gap-0.5 py-2"
                        onClick={() => selectPaymentMode("split")}
                      >
                        <span>Split</span>
                        <span className="text-[0.7rem] opacity-70">{SALE_KEYS.split.key}</span>
                      </Button>
                    </div>
                  </div>
                  {isSplitPayment && splitAmounts ? (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="splitCashAmount">Cash amount</Label>
                        <Input
                          key="split-cash"
                          ref={splitCashAmountRef}
                          id="splitCashAmount"
                          type="number"
                          min={0}
                          step="any"
                          placeholder="Cash portion"
                          className="h-12 text-lg tabular-nums"
                          value={
                            splitAmounts.cash === 0 ? "" : splitAmounts.cash
                          }
                          onFocus={(event) => {
                            event.currentTarget.select();
                          }}
                          onChange={(event) =>
                            updateSplitCashAmount(event.target.value)
                          }
                        />
                        {splitCashOverDue ? (
                          <p className="text-destructive text-xs" role="alert">
                            Cash cannot exceed amount due (
                            {formatMoney(amountDue)})
                          </p>
                        ) : splitAmounts.cash <= 0 ? (
                          <p className="text-muted-foreground text-xs">
                            Enter cash portion (must be greater than zero)
                          </p>
                        ) : null}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="splitCardAmount">Card amount</Label>
                        <Input
                          id="splitCardAmount"
                          type="number"
                          readOnly
                          tabIndex={-1}
                          className="bg-muted/50 h-12 text-lg tabular-nums"
                          value={numericInputDisplayValue(splitAmounts.card)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="splitCardReference">Card reference</Label>
                        <Input
                          id="splitCardReference"
                          placeholder="Optional"
                          value={splitAmounts.cardReference}
                          onChange={(event) =>
                            updateSplitCardReference(event.target.value)
                          }
                        />
                      </div>
                    </>
                  ) : payment ? (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="paymentAmount">
                          {isCashPayment ? "Cash received" : "Amount"}
                        </Label>
                        <Input
                          ref={paymentAmountRef}
                          id="paymentAmount"
                          type="number"
                          min={0}
                          max={isCashPayment ? cashMaxTender : amountDue}
                          step="any"
                          placeholder={isCashPayment ? "Tendered" : "Amount"}
                          className="h-12 text-lg tabular-nums"
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
                        {cashOverMax ? (
                          <p className="text-destructive text-xs" role="alert">
                            Max tender {formatMoney(cashMaxTender)}
                          </p>
                        ) : null}
                      </div>
                      {paymentMode === "card" ? (
                        <div className="space-y-2">
                          <Label htmlFor="paymentReference">Reference</Label>
                          <Input
                            id="paymentReference"
                            placeholder="Optional"
                            value={payment.reference}
                            onChange={(event) => {
                              paymentsTouchedRef.current = true;
                              setPayments([
                                { ...payment, reference: event.target.value },
                              ]);
                            }}
                          />
                        </div>
                      ) : null}
                      {isCashPayment ? (
                        <div className="bg-muted rounded-md px-4 py-3 text-lg">
                          {amountDue === 0 && appliedReturn ? (
                            <div className="flex justify-between gap-4 font-semibold">
                              <span>Cash back from credit</span>
                              <span className="text-xl tabular-nums">
                                {formatMoney(cashBackFromCredit)}
                              </span>
                            </div>
                          ) : tendered >= amountDue ? (
                            <div className="flex justify-between gap-4 font-semibold">
                              <span>Change</span>
                              <span className="text-success text-2xl tabular-nums">
                                {formatMoney(cashChange)}
                              </span>
                            </div>
                          ) : (
                            <div className="flex justify-between gap-4 font-semibold">
                              <span>Short</span>
                              <span className="text-warning text-2xl tabular-nums">
                                {formatMoney(cashShortfall)}
                              </span>
                            </div>
                          )}
                        </div>
                      ) : cardRemaining !== 0 ? (
                        <p className="text-warning text-sm">
                          Remaining: {formatMoney(cardRemaining)}
                        </p>
                      ) : null}
                    </>
                  ) : null}
                </>
              ) : (
                <p className="text-muted-foreground text-sm">
                  Add items to enable payment
                </p>
              )}
            </div>
          </FormEnterNav>

          <div className="flex flex-col gap-2">
            <Button
              type="button"
              size="lg"
              className="h-14 w-full text-base"
              disabled={saving || !canPost}
              onClick={() => void onConfirm()}
            >
              {saving ? (
                user?.fbrEnabled && !nonFbrSale ? "Posting and sending to FBR…" : "Posting…"
              ) : (
                <>
                  {SALE_KEYS.post.label}
                  <Kbd className="border-primary-foreground/30 bg-primary-foreground/10 text-primary-foreground">
                    {SALE_KEYS.post.key}
                  </Kbd>
                </>
              )}
            </Button>
          </div>
        </aside>
      </div>

      <SaleKeyHintBar />

      <ScanBarcodePanel
        open={removeScanOpen}
        onOpenChange={setRemoveScanOpen}
        title="Remove item"
        description="Scan the barcode of an item on this bill to remove it."
        layer="dialog"
        returnFocusTo="#saleScanInput"
        onComplete={(code) => void onRemoveBarcodeEnter(code)}
      />

      <ScanBarcodePanel
        open={adjustScanOpen}
        onOpenChange={setAdjustScanOpen}
        title="Adjust quantity"
        description="Scan the barcode of an item on this bill to correct its quantity."
        layer="dialog"
        returnFocusTo="#saleScanInput"
        onComplete={(code) => void onAdjustBarcodeEnter(code)}
      />

      <AdjustSaleQtyDialog
        open={adjustQtyOpen}
        line={adjustQtyLine}
        busy={adjustingQty}
        onOpenChange={(open) => {
          setAdjustQtyOpen(open);
          if (!open) {
            setAdjustQtyLine(null);
            focusScanInput();
          }
        }}
        onApply={async (newQuantity) => {
          if (!adjustQtyLine) return;
          setAdjustingQty(true);
          try {
            const ok = await adjustBillLineQuantity(adjustQtyLine, newQuantity);
            if (ok) {
              setAdjustQtyOpen(false);
              setAdjustQtyLine(null);
              focusScanInput();
            }
          } finally {
            setAdjustingQty(false);
          }
        }}
      />

      <AddSaleItemDialog
        open={itemOpen}
        warehouseId={warehouseId}
        excludeDraftSaleId={editingDraftId}
        onClose={() => {
          setItemOpen(false);
          focusScanInput();
        }}
        onAddMany={onAddManyFromDialog}
      />

      <AddSaleItemDialog
        mode="foc"
        open={focItemOpen}
        warehouseId={warehouseId}
        excludeDraftSaleId={editingDraftId}
        onClose={() => {
          setFocItemOpen(false);
          focusScanInput();
        }}
        onAddMany={onAddManyFocFromDialog}
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
