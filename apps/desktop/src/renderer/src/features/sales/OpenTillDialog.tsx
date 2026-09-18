import { useEffect, useState } from "react";
import type { TillSessionDetail } from "@blackbox/shared";
import { emptyTillNotes, validateTillOpeningBalanceAmount } from "@blackbox/shared";
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
import { openTill } from "@renderer/lib/local-db/till-source";

type Step = "authorize" | "balance";

export function OpenTillDialog({
  open,
  onOpenChange,
  cashierUserId,
  cashierName,
  requireApproval,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cashierUserId: string;
  cashierName: string;
  requireApproval: boolean;
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
    setStep(requireApproval ? "authorize" : "balance");
  }, [open, requireApproval]);

  async function onManagerAuthorize(): Promise<void> {
    setError(null);
    const totp = await promptSupervisorTotp();
    if (!totp.approved) return;
    setSupervisorUserId(totp.supervisorUserId);
    setSupervisorDisplayName(totp.supervisorDisplayName);
    setStep("balance");
  }

  async function onConfirmOpen(): Promise<void> {
    const balance = Number(openingBalance);
    const validationError = validateTillOpeningBalanceAmount(balance);
    if (validationError) {
      setError(validationError);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const detail = await openTill({
        userId: cashierUserId,
        userName: cashierName,
        body: {
          ...emptyTillNotes(),
          openingBalance: balance,
          supervisorApproved: requireApproval ? true : undefined,
          supervisorUserId,
        },
        requireApproval,
        supervisorDisplayName: supervisorDisplayName ?? cashierName,
      });
      onSuccess(detail);
      onOpenChange(false);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Failed to open till"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Open till</DialogTitle>
          <DialogDescription>
            {step === "authorize"
              ? "Ask a manager or owner to enter their Authy code to authorize opening this till."
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
            <Label htmlFor="tillOpeningBalance">Opening balance (Rs)</Label>
            <Input
              id="tillOpeningBalance"
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
                  void onConfirmOpen();
                }
              }}
            />
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
              onClick={() => void onConfirmOpen()}
            >
              {busy ? "Opening…" : "Open till"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
