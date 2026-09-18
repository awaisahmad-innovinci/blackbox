import { useEffect, useState } from "react";
import type { TillSessionDetail } from "@blackbox/shared";
import { Button } from "@blackbox/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@blackbox/ui/dialog";
import { Input } from "@blackbox/ui/input";
import { Label } from "@blackbox/ui/label";
import { useSupervisorTotp } from "@renderer/components/supervisor-totp-provider";
import { getApiErrorMessage } from "@renderer/lib/api/client";
import { collectCashByAmountFromTill } from "@renderer/lib/local-db/till-source";

type Step = "authorize" | "receive";

export function CollectCashDialog({
  open,
  onOpenChange,
  session,
  cashierUserId,
  cashierName,
  requireApproval,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: TillSessionDetail;
  cashierUserId: string;
  cashierName: string;
  requireApproval: boolean;
  onSuccess: (updated: TillSessionDetail) => void;
}) {
  const { promptSupervisorTotp } = useSupervisorTotp();
  const [step, setStep] = useState<Step>("authorize");
  const [supervisorUserId, setSupervisorUserId] = useState<string | undefined>();
  const [supervisorDisplayName, setSupervisorDisplayName] = useState<
    string | undefined
  >();
  const [receivedAmount, setReceivedAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setReceivedAmount("");
    setSupervisorUserId(undefined);
    setSupervisorDisplayName(undefined);
    setStep(requireApproval ? "authorize" : "receive");
  }, [open, requireApproval]);

  async function onManagerAuthorize(): Promise<void> {
    setError(null);
    const totp = await promptSupervisorTotp();
    if (!totp.approved) return;
    setSupervisorUserId(totp.supervisorUserId);
    setSupervisorDisplayName(totp.supervisorDisplayName);
    setStep("receive");
  }

  async function onConfirmReceive(): Promise<void> {
    const amount = Number(receivedAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a valid cash received amount.");
      return;
    }
    if (amount > session.currentCashBalance) {
      setError("Amount exceeds current till cash balance.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const updated = await collectCashByAmountFromTill({
        cashierUserId,
        cashierName,
        amount,
        supervisorUserId,
        supervisorDisplayName,
      });
      onSuccess(updated);
      onOpenChange(false);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Failed to withdraw cash"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Withdraw cash</DialogTitle>
          <DialogDescription>
            {step === "authorize"
              ? "Ask a manager or owner to enter their Authy code to authorize a cash withdrawal."
              : "Manager: enter the cash amount you received from this till."}
          </DialogDescription>
        </DialogHeader>

        {step === "authorize" ? (
          <div className="space-y-4">
            <p className="text-muted-foreground text-sm">
              Current till cash:{" "}
              <span className="font-medium tabular-nums text-foreground">
                Rs {session.currentCashBalance.toLocaleString()}
              </span>
            </p>
            <Button
              type="button"
              className="w-full"
              disabled={busy}
              onClick={() => void onManagerAuthorize()}
            >
              Manager Authy code
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cashReceivedAmount">Cash received (Rs)</Label>
              <Input
                id="cashReceivedAmount"
                type="number"
                min={0}
                max={session.currentCashBalance}
                step="any"
                inputMode="decimal"
                autoFocus
                value={receivedAmount}
                disabled={busy}
                onChange={(event) => setReceivedAmount(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void onConfirmReceive();
                  }
                }}
              />
              <p className="text-muted-foreground text-xs">
                Max {session.currentCashBalance.toLocaleString()} in till
              </p>
            </div>
          </div>
        )}

        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          {step === "receive" ? (
            <Button
              type="button"
              disabled={busy || receivedAmount.trim() === ""}
              onClick={() => void onConfirmReceive()}
            >
              {busy ? "Saving…" : "Confirm withdrawal"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
