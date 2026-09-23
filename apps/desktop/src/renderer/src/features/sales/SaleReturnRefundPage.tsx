import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { SaleReturnLookupSummary, TillSessionDetail } from "@blackbox/shared";
import { Button } from "@blackbox/ui/button";
import { Input } from "@blackbox/ui/input";
import { Label } from "@blackbox/ui/label";
import { ScanBarcodePanel } from "@renderer/components/scan-barcode-panel";
import {
  KEYBOARD_HINT_SCAN,
  KeyboardHints,
} from "@renderer/components/keyboard-hints";
import { getApiErrorMessage } from "@renderer/lib/api/client";
import { logActivityEvent } from "@renderer/lib/api/activity-logs";
import { saleReturnsApi } from "@renderer/lib/api/sale-returns";
import { lookupSaleReturn } from "@renderer/lib/local-db/entity-source";
import { commitLocalChange, isDeviceBound } from "@renderer/lib/local-db/local-write";
import {
  applyTillCashRefund,
  assertTillCanPayRefund,
  loadCurrentTill,
} from "@renderer/lib/local-db/till-source";
import { syncNow } from "@renderer/lib/sync/sync-status";
import { useSession } from "@renderer/lib/session/context";
import { useSalesAccess } from "@renderer/lib/use-sales-access";
import { usePageKeyboard } from "@renderer/lib/use-page-keyboard";

export function SaleReturnRefundPage() {
  const { user } = useSession();
  const { canRefund } = useSalesAccess();
  const [returnEntry, setReturnEntry] = useState("");
  const [scanOpen, setScanOpen] = useState(false);
  const [lookup, setLookup] = useState<SaleReturnLookupSummary | null>(null);
  const [tillSession, setTillSession] = useState<TillSessionDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const completedLookupMessage =
    error?.startsWith("Already processed by") ?? false;

  useEffect(() => {
    if (!user?.id) return;
    void loadCurrentTill(user.id)
      .then(setTillSession)
      .catch(() => undefined);
  }, [user?.id]);

  async function onLookup(code: string) {
    const trimmed = code.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    try {
      const summary = await lookupSaleReturn(trimmed);
      setLookup(summary);
      setReturnEntry("");
    } catch (err: unknown) {
      setLookup(null);
      setError(getApiErrorMessage(err, "Return voucher not found"));
    } finally {
      setLoading(false);
    }
  }

  async function onConfirmRefund() {
    if (!lookup || !user?.id) return;
    setConfirming(true);
    setError(null);
    const cashierName = user.fullName?.trim() || user.username;

    try {
      await assertTillCanPayRefund({
        userId: user.id,
        refundAmount: lookup.refundTotal,
      });

      if (await isDeviceBound()) {
        await applyTillCashRefund({
          userId: user.id,
          refundAmount: lookup.refundTotal,
        });

        const detail = await window.blackbox!.localDb!.completeSaleReturnStandalone!(
          {
            returnId: lookup.id,
            userId: user.id,
            userName: cashierName,
          },
        );

        await commitLocalChange({
          entityType: "sale_return",
          entityId: detail.id,
          operation: "UPSERT",
          payload: detail as unknown as Record<string, unknown>,
        });

        await logActivityEvent(
          {
            eventType: "sale.return_refunded",
            actorUserId: user.id,
            summary: `${cashierName} refunded return ${detail.returnNumber} — Rs ${detail.refundTotal.toLocaleString()} cash`,
            metadata: {
              returnNumber: detail.returnNumber,
              returnId: detail.id,
              refundTotal: detail.refundTotal,
              issuedByName: lookup.issuedByName,
              completionMode: "STANDALONE_CASH",
            },
          },
          { actorName: cashierName },
        );

        await syncNow();
        setLookup(null);
        const refreshedTill = await loadCurrentTill(user.id);
        setTillSession(refreshedTill);
        return;
      }

      const detail = await saleReturnsApi.completeStandalone(lookup.id);
      try {
        await window.blackbox?.localDb?.upsertSaleReturn?.(detail);
      } catch {
        /* optional cache */
      }

      const refreshedTill = await loadCurrentTill(user.id);
      setTillSession(refreshedTill);
      try {
        if (refreshedTill) {
          await window.blackbox?.localDb?.upsertTillSession?.(refreshedTill);
        }
      } catch {
        /* optional cache */
      }

      await logActivityEvent(
        {
          eventType: "sale.return_refunded",
          actorUserId: user.id,
          summary: `${cashierName} refunded return ${detail.returnNumber} — Rs ${detail.refundTotal.toLocaleString()} cash`,
          metadata: {
            returnNumber: detail.returnNumber,
            returnId: detail.id,
            refundTotal: detail.refundTotal,
            issuedByName: lookup.issuedByName,
            completionMode: "STANDALONE_CASH",
          },
        },
        { actorName: cashierName },
      );

      setLookup(null);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Failed to complete refund"));
    } finally {
      setConfirming(false);
    }
  }

  usePageKeyboard({
    enabled: canRefund,
    onScan: () => setScanOpen(true),
  });

  if (!canRefund) {
    return (
      <p className="text-muted-foreground text-sm">
        You do not have permission to refund return vouchers.
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Refund return</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Scan or enter a pending return voucher and pay cash from your till.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link to="/sales/till">Till</Link>
        </Button>
      </div>

      <div className="space-y-2">
        <Label htmlFor="returnVoucher">Return voucher</Label>
        <div className="flex gap-2">
          <Input
            id="returnVoucher"
            placeholder="Scan or type return #"
            value={returnEntry}
            disabled={loading}
            onChange={(event) => setReturnEntry(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void onLookup(returnEntry);
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={loading || !returnEntry.trim()}
            onClick={() => void onLookup(returnEntry)}
          >
            Look up
          </Button>
        </div>
        <KeyboardHints hints={[KEYBOARD_HINT_SCAN]} />
      </div>

      {error ? (
        <p
          className={
            completedLookupMessage
              ? "border-amber-500/40 bg-amber-500/10 text-amber-950 dark:text-amber-100 rounded-lg border px-4 py-3 text-sm"
              : "text-destructive text-sm"
          }
          role={completedLookupMessage ? "status" : "alert"}
        >
          {error}
        </p>
      ) : null}

      {tillSession?.status === "OPEN" ? (
        <p className="text-muted-foreground text-sm">
          Till balance: Rs {tillSession.currentCashBalance.toLocaleString()}
        </p>
      ) : null}

      {lookup ? (
        <div className="space-y-4 rounded-lg border p-4">
          <div>
            <p className="text-lg font-semibold">{lookup.returnNumber}</p>
            <p className="text-muted-foreground text-sm">
              Original sale {lookup.saleNumber}
              {lookup.issuedByName ? ` · Issued by ${lookup.issuedByName}` : ""}
            </p>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Refund due</span>
            <span className="text-xl font-bold tabular-nums">
              {lookup.refundTotal.toLocaleString()}
            </span>
          </div>
          <Button
            className="w-full"
            disabled={confirming}
            onClick={() => void onConfirmRefund()}
          >
            {confirming ? "Processing…" : "Confirm cash refund"}
          </Button>
        </div>
      ) : null}

      <ScanBarcodePanel
        open={scanOpen}
        onOpenChange={setScanOpen}
        title="Scan return voucher"
        onComplete={(code) => {
          void onLookup(code);
          setScanOpen(false);
        }}
      />
    </div>
  );
}
