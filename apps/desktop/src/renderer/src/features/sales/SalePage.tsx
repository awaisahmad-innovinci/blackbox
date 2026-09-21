import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  lineTotalAfterDiscount,
  lineTotalForScan,
  maxCashTender,
  saleBillTotals,
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
import {
  KEYBOARD_HINT_ENTER,
  KEYBOARD_HINT_SAVE,
  KEYBOARD_HINT_SCAN,
  KeyboardHints,
} from "@renderer/components/keyboard-hints";
import { useConfirm } from "@renderer/components/confirm-provider";
import { removeTableLineConfirmOptions } from "@renderer/lib/confirm-remove-line";
import { useSupervisorTotp } from "@renderer/components/supervisor-totp-provider";
import {
  barcodeScanInputProps,
  useBarcodeScanTarget,
} from "@renderer/lib/barcode-scan";
import { usePageKeyboard } from "@renderer/lib/use-page-keyboard";
import { getApiErrorMessage } from "@renderer/lib/api/client";
import { logActivityEvent } from "@renderer/lib/api/activity-logs";
import { salesApi } from "@renderer/lib/api/sales";
import { syncNow, useSyncStatus } from "@renderer/lib/sync/sync-status";
import { commitLocalChange, isDeviceBound } from "@renderer/lib/local-db/local-write";
import { loadSkuByBarcode, loadSale, loadWarehouses, loadPosAvailableForSale, lookupSkuByBarcode } from "@renderer/lib/local-db/entity-source";
import {
  applyTillCashFromSale,
  assertTillCanPostSale,
  loadCurrentTill,
} from "@renderer/lib/local-db/till-source";
import { AddSaleItemDialog } from "./AddSaleItemDialog";
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

function paymentMethodLabel(method: SalePaymentMethod): string {
  if (method === "CASH") return "Cash";
  if (method === "CARD") return "Card";
  return "Credit";
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
  const requireTotp = user?.requireManagerApprovalRemoveSaleLine ?? true;
  const requireTillWithdrawApproval =
    user?.requireManagerApprovalTillWithdraw ?? true;

  const [warehouses, setWarehouses] = useState<WarehouseListItem[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [lines, setLines] = useState<DraftSaleLine[]>([]);
  const [payments, setPayments] = useState<DraftPayment[]>([]);
  const [scanDraft, setScanDraft] = useState("");
  const [itemOpen, setItemOpen] = useState(false);
  const [removeScanOpen, setRemoveScanOpen] = useState(false);
  const [adjustScanOpen, setAdjustScanOpen] = useState(false);
  const [adjustQtyOpen, setAdjustQtyOpen] = useState(false);
  const [adjustQtyLine, setAdjustQtyLine] = useState<DraftSaleLine | null>(null);
  const [adjustingQty, setAdjustingQty] = useState(false);
  const [showCustomerField, setShowCustomerField] = useState(false);
  const [scanBusy, setScanBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [holding, setHolding] = useState(false);
  const [loadingDraft, setLoadingDraft] = useState(Boolean(routeDraftId));
  const [tillSession, setTillSession] = useState<TillSessionDetail | null>(null);
  const [collectDialogOpen, setCollectDialogOpen] = useState(false);
  const editingDraftId = routeDraftId ?? null;
  const holdNumberRef = useRef<string | null>(null);
  const holdInFlightRef = useRef(false);
  const scanQueueRef = useRef<string[]>([]);
  const scanProcessingRef = useRef(false);
  const paymentsTouchedRef = useRef(false);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const paymentAmountRef = useRef<HTMLInputElement>(null);

  const focusScanInput = useCallback(() => {
    requestAnimationFrame(() => {
      scanInputRef.current?.focus();
      scanInputRef.current?.select();
    });
  }, []);

  function resetForNewSale() {
    setLines([]);
    setPayments([]);
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
    if (loadingDraft || !warehouseId || itemOpen || removeScanOpen || adjustScanOpen || adjustQtyOpen) return;
    focusScanInput();
  }, [loadingDraft, warehouseId, itemOpen, removeScanOpen, adjustScanOpen, adjustQtyOpen, focusScanInput]);

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
              discountPercent: item.discountPercent ?? 0,
              focQuantity: item.focQuantity ?? 0,
              quantityCorrected: item.quantityCorrected ?? false,
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

  const tenantGstRate = user?.defaultGstRate ?? 0;
  const tenantSalesTaxRate = user?.defaultSalesTaxRate ?? 0;

  const tax = useMemo(
    () =>
      saleBillTotals(subtotal, tenantGstRate, tenantSalesTaxRate),
    [subtotal, tenantGstRate, tenantSalesTaxRate],
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
        (line) =>
          line.quantity > 0 &&
          lineInventoryQty(line) <= line.quantityAvailable,
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
    const gst = tenantGstRate;
    const salesTax = tenantSalesTaxRate;
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
        sellUnit: line.sellUnit,
        ...(line.quantityCorrected ? { quantityCorrected: true } : {}),
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
        if (nextQty + existing.focQuantity > available) {
          scanError = `Cannot exceed POS balance (${available}) for ${row.sku}`;
          return prev;
        }
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
          discountPercent: row.saleDiscountPercent ?? 0,
          focQuantity: 0,
          lastScanMultiplier: multiplier,
        },
      ];
    });

    if (!scanError) {
      focusScanInput();
    }
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
      setScanDraft("");
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

  function selectPaymentMethod(method: SalePaymentMethod): void {
    if (!payment) return;
    paymentsTouchedRef.current = true;
    setPayments([
      {
        ...payment,
        method,
        amount: method === "CASH" ? payment.amount : billTotal,
      },
    ]);
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
    if (line.quantityCorrected) {
      setError("Quantity already corrected for this item");
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
    if (line.quantityCorrected) {
      setError("Quantity already corrected for this item");
      return false;
    }
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

    const focLines = lines.filter((line) => line.focQuantity > 0);
    let focSupervisorUserId: string | null = null;
    let focSupervisorDisplayName: string | null = null;
    if (focLines.length > 0) {
      const totp = await promptSupervisorTotp();
      if (!totp.approved) return;
      focSupervisorUserId = totp.supervisorUserId;
      focSupervisorDisplayName = totp.supervisorDisplayName;
    }

    setSaving(true);
    try {
      const gst = tenantGstRate;
      const salesTax = tenantSalesTaxRate;
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

        void syncNow();
        if (user?.id) {
          if (focLines.length > 0) {
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
        navigate(`/sales/${detail.id}`);
        return;
      }

      const detail = await salesApi.create({
        warehouseId,
        gstRate: gst,
        salesTaxRate: salesTax,
        customerName: resolvedCustomerName,
        cashTendered: resolvedCashTendered() ?? undefined,
        supervisorUserId: focSupervisorUserId ?? undefined,
        items: lines.map((line) => ({
          productSkuId: line.productSkuId,
          quantity: line.quantity,
          discountPercent: line.discountPercent,
          focQuantity: line.focQuantity,
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

      if (focLines.length > 0 && user?.id) {
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

      try {
        await window.blackbox?.localDb?.upsertSale?.(detail);
      } catch {
        /* optional cache */
      }
      navigate(`/sales/${detail.id}`);
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
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
        return;
      }
      if (event.key === "F1") {
        event.preventDefault();
        if (lines.length > 0) setRemoveScanOpen(true);
        return;
      }
      if (event.key === "F8") {
        event.preventDefault();
        if (lines.length > 0) setAdjustScanOpen(true);
        return;
      }
      if (event.key === "F6") {
        event.preventDefault();
        if (canHold && !holding) void onHoldBill();
        return;
      }
      if (event.key === "F7") {
        event.preventDefault();
        navigate("/sales/held");
        return;
      }
      if (event.key === "F4") {
        event.preventDefault();
        paymentAmountRef.current?.focus();
        paymentAmountRef.current?.select();
        return;
      }
      if (event.key === "F5") {
        event.preventDefault();
        if (payment) selectPaymentMethod("CASH");
        return;
      }
      if (event.key === "F9") {
        event.preventDefault();
        if (payment) selectPaymentMethod("CARD");
      }
    }

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [loadingDraft, canHold, holding, navigate, payment, billTotal, lines.length]);

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
      <div className="border-border bg-muted/30 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-2 text-sm">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-semibold">
            {user?.tenantName?.trim() || "Store"}
          </span>
          <span className="text-muted-foreground">·</span>
          <span>{user?.fullName?.trim() || user?.username || "Cashier"}</span>
          {tillStatusLabel ? (
            <>
              <span className="text-muted-foreground">·</span>
              <span
                className={cn(
                  tillBlocked && "text-destructive font-medium",
                  tillNearLimit && !tillBlocked && "text-amber-700 dark:text-amber-300",
                )}
              >
                {tillStatusLabel}
              </span>
            </>
          ) : null}
          <span className="text-muted-foreground">·</span>
          <span
            className={cn(
              sync.lastError && "text-destructive",
              offline && !sync.lastError && "text-amber-700 dark:text-amber-300",
            )}
          >
            {syncLabel}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {editingDraftId ? (
            <span className="text-muted-foreground text-xs">
              {holdNumberRef.current ?? "Held bill"}
            </span>
          ) : null}
          {!canManageTill && tillSession?.status === "OPEN" ? (
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
        </div>
      ) : null}

      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[3fr_2fr]">
        <div className="flex min-h-0 flex-col gap-3">
          <div className="space-y-2">
            <Label htmlFor="saleScanInput" className="sr-only">
              Scan barcode
            </Label>
            <Input
              ref={scanInputRef}
              id="saleScanInput"
              {...barcodeScanInputProps()}
              autoComplete="off"
              disabled={!warehouseId || scanBusy}
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
                handleScanFieldEnter();
              }}
              className="h-11 text-base"
            />
            <p className="text-muted-foreground text-xs">
              Rescanning the same SKU adds quantity. F2 focuses this field.
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
              Add item (F3)
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={lines.length === 0}
              onClick={() => setRemoveScanOpen(true)}
            >
              Remove item (F1)
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={lines.length === 0}
              onClick={() => setAdjustScanOpen(true)}
            >
              Adjust qty (F8)
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!canHold || holding}
              onClick={() => void onHoldBill()}
            >
              {holding ? "Holding…" : "Hold (F6)"}
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

          <div className="border-border min-h-0 flex-1 overflow-auto rounded-lg border">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/40 text-muted-foreground sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-2 font-medium">Product</th>
                  <th className="px-3 py-2 font-medium">Qty</th>
                  <th className="px-3 py-2 font-medium">Disc %</th>
                  <th className="px-3 py-2 font-medium">FOC</th>
                  <th className="px-3 py-2 font-medium">Price</th>
                  <th className="px-3 py-2 font-medium">Total</th>
                  <th className="px-3 py-2 w-10" />
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="text-muted-foreground px-3 py-8 text-center"
                    >
                      Scan or add items to start a sale
                    </td>
                  </tr>
                ) : (
                  lines.map((line) => (
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
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        <div className="flex items-center gap-2">
                          <span>{line.quantity.toLocaleString()}</span>
                          {!line.quantityCorrected ? (
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
                      <td className="px-3 py-2 tabular-nums">
                        {lineUnitPrice(line).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 tabular-nums font-medium">
                        {lineTotal(line).toLocaleString()}
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
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="border-border lg:sticky lg:top-20 lg:self-start space-y-4 rounded-lg border p-4">
          <div>
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              Invoice
            </p>
            <p className="text-lg font-semibold">
              {editingDraftId
                ? holdNumberRef.current ?? "Held bill"
                : "New sale"}
            </p>
          </div>

          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="tabular-nums">{subtotal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">
                GST ({tenantGstRate}%)
              </span>
              <span className="tabular-nums">
                {tax.gstAmount.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">
                Sales tax ({tenantSalesTaxRate}%)
              </span>
              <span className="tabular-nums">
                {tax.salesTaxAmount.toLocaleString()}
              </span>
            </div>
            <div className="border-border flex justify-between gap-4 border-t pt-3">
              <span className="text-base font-semibold">Total</span>
              <span className="text-3xl font-bold tabular-nums tracking-tight">
                {tax.total.toLocaleString()}
              </span>
            </div>
          </div>

          <FormEnterNav>
            <div className="space-y-3">
              <h2 className="text-sm font-medium">Payment</h2>
              {payment ? (
                <>
                  <div className="space-y-2">
                    <Label>Method</Label>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant={
                          payment.method === "CASH" ? "default" : "outline"
                        }
                        size="sm"
                        onClick={() => selectPaymentMethod("CASH")}
                      >
                        Cash (F5)
                      </Button>
                      <Button
                        type="button"
                        variant={
                          payment.method === "CARD" ? "default" : "outline"
                        }
                        size="sm"
                        onClick={() => selectPaymentMethod("CARD")}
                      >
                        Card (F9)
                      </Button>
                    </div>
                    {/* <select
                      id="paymentMethod"
                      className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                      value={payment.method}
                      onChange={(event) => {
                        selectPaymentMethod(
                          event.target.value as SalePaymentMethod,
                        );
                      }}
                    >
                      {PAYMENT_METHODS.map((method) => (
                        <option key={method} value={method}>
                          {paymentMethodLabel(method)}
                        </option>
                      ))}
                    </select> */}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="paymentAmount">
                      {isCashPayment ? "Cash received" : "Amount"}
                    </Label>
                    <Input
                      ref={paymentAmountRef}
                      id="paymentAmount"
                      type="number"
                      min={0}
                      max={isCashPayment ? cashMaxTender : billTotal}
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
                        Max tender {cashMaxTender.toLocaleString()}
                      </p>
                    ) : null}
                  </div>
                  {payment.method !== "CASH" ? (
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
                    <div className="rounded-md bg-muted/50 px-3 py-3 text-lg">
                      {tendered >= billTotal ? (
                        <div className="flex justify-between gap-4 font-semibold">
                          <span>Change</span>
                          <span className="text-xl text-green-700 tabular-nums dark:text-green-400">
                            {cashChange.toLocaleString()}
                          </span>
                        </div>
                      ) : (
                        <div className="flex justify-between gap-4 font-semibold">
                          <span>Short</span>
                          <span className="text-xl text-amber-700 tabular-nums dark:text-amber-300">
                            {cashShortfall.toLocaleString()}
                          </span>
                        </div>
                      )}
                    </div>
                  ) : cardRemaining !== 0 ? (
                    <p className="text-amber-700 text-sm dark:text-amber-300">
                      Remaining: {cardRemaining.toLocaleString()}
                    </p>
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
              className="w-full"
              disabled={saving || !canPost}
              onClick={() => void onConfirm()}
            >
              {saving ? "Posting…" : "Post sale (F10)"}
            </Button>
          </div>
        </aside>
      </div>

      <KeyboardHints
        hints={[
          KEYBOARD_HINT_SCAN,
          KEYBOARD_HINT_SAVE,
          "F1 remove · F8 adjust qty · F4 tender · F5 cash · F9 card · F6 hold · F7 held bills",
          KEYBOARD_HINT_ENTER,
        ]}
      />

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
