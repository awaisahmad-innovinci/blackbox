import { useEffect, useState } from "react";
import type { TillSessionDetail } from "@blackbox/shared";
import {
  emptyTillNotes,
  tillMaxLimit,
  validateTillOpeningBalanceAmount,
} from "@blackbox/shared";
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
import { reopenTill } from "@renderer/lib/local-db/till-source";

type Step = "authorize" | "balance";

export function ReopenTillDialog({
  open,
  onOpenChange,
  closedSessionId,
  cashierName,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  closedSessionId: string;
  cashierName: string;
  onSuccess: (detail: TillSessionDetail) => void;
}) {
  const { promptSupervisorTotp } = useSupervisorTotp();
  const [step, setStep] = useState<Step>("authorize");
  const [supervisorUserId, setSupervisorUserId] = useState<string | undefined>();
  const [supervisorDisplayName, setSupervisorDisplayName] = useState<
    string | undefined
  >();
  const [openingBalance, setOpeningBalance] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setOpeningBalance("");
    setSupervisorUserId(undefined);
    setSupervisorDisplayName(undefined);
    setStep("authorize");
  }, [open]);

  async function onManagerAuthorize(): Promise<void> {
    setError(null);
    const totp = await promptSupervisorTotp();
    if (!totp.approved) return;
    setSupervisorUserId(totp.supervisorUserId);
    setSupervisorDisplayName(totp.supervisorDisplayName);
    setStep("balance");
  }

  async function onConfirmReopen(): Promise<void> {
    if (!supervisorUserId || !supervisorDisplayName) return;

    const balance = Number(openingBalance);
    const validationError = validateTillOpeningBalanceAmount(balance);
    if (validationError) {
      setError(validationError);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const detail = await reopenTill({
        id: closedSessionId,
        managerId: supervisorUserId,
        managerName: supervisorDisplayName,
        body: {
          ...emptyTillNotes(),
          openingBalance: balance,
          supervisorUserId,
        },
        supervisorDisplayName,
        cashierName,
      });
      onSuccess(detail);
      onOpenChange(false);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Failed to reopen till"));
    } finally {
      setBusy(false);
    }
  }

  const balanceNum = Number(openingBalance);
  const maxLimitHint =
    Number.isFinite(balanceNum) && balanceNum >= 0
      ? tillMaxLimit(balanceNum)
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Open till</DialogTitle>
          <DialogDescription>
            {step === "authorize"
              ? "Ask a manager or owner to enter their Authy code to reopen this till."
              : "Manager: enter the opening cash balance for this till."}
          </DialogDescription>
        </DialogHeader>

        {step === "authorize" ? (
          <Button
            type="button"
            className="w-full"
            disabled={busy}
            onClick={() => void onManagerAuthorize()}
          >
            Manager Authy code
          </Button>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="reopenOpeningBalance">Opening balance (Rs)</Label>
            <Input
              id="reopenOpeningBalance"
              type="number"
              min={0}
              step="any"
              inputMode="decimal"
              autoFocus
              value={openingBalance}
              disabled={busy}
              onChange={(event) => setOpeningBalance(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void onConfirmReopen();
                }
              }}
            />
            {maxLimitHint != null ? (
              <p className="text-muted-foreground text-xs">
                Max cash limit will be Rs {maxLimitHint.toLocaleString()}
              </p>
            ) : null}
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
          {step === "balance" ? (
            <Button
              type="button"
              disabled={busy || openingBalance.trim() === ""}
              onClick={() => void onConfirmReopen()}
            >
              {busy ? "Opening…" : "Open till"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
