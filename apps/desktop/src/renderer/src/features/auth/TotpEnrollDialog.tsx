import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
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
import { getApiErrorMessage } from "@renderer/lib/api/client";
import {
  refreshSupervisorTotpCache,
  totpApi,
} from "@renderer/lib/api/totp";
import { afterDialogClosed } from "@renderer/lib/on-dialog-open-change";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after successful confirm (enrollment complete). */
  onEnrolled?: () => void;
  allowDismiss?: boolean;
};

export function TotpEnrollDialog({
  open,
  onOpenChange,
  onEnrolled,
  allowDismiss = true,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!open) {
      setQrDataUrl(null);
      setCode("");
      setError(null);
      afterDialogClosed();
      return;
    }

    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const start = await totpApi.enrollStart();
        if (!cancelled) setQrDataUrl(start.qrDataUrl);
      } catch (err) {
        if (!cancelled) {
          setError(getApiErrorMessage(err, "Could not start Authy setup"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  async function onConfirm() {
    if (!/^\d{6}$/.test(code.trim())) {
      setError("Enter the 6-digit code from Authy");
      return;
    }
    setConfirming(true);
    setError(null);
    try {
      await totpApi.enrollConfirm(code.trim());
      await refreshSupervisorTotpCache();
      onEnrolled?.();
      onOpenChange(false);
    } catch (err) {
      setError(getApiErrorMessage(err, "Verification failed"));
    } finally {
      setConfirming(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !allowDismiss) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Set up Authy</DialogTitle>
          <DialogDescription>
            Scan this QR code once in Authy (or another authenticator app), then
            enter the 6-digit code to finish. You will not see this again unless
            you reset Authy.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="text-muted-foreground flex items-center justify-center py-10 text-sm">
            <Loader2 className="mr-2 size-4 animate-spin" />
            Preparing QR code…
          </div>
        ) : qrDataUrl ? (
          <div className="flex flex-col items-center gap-4">
            <img
              src={qrDataUrl}
              alt="Authy QR code"
              className="border-border size-48 rounded-md border bg-white p-2"
            />
            <div className="w-full space-y-2">
              <Label htmlFor="totpConfirmCode">Verification code</Label>
              <Input
                id="totpConfirmCode"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
              />
            </div>
          </div>
        ) : null}

        {error ? <p className="text-destructive text-sm">{error}</p> : null}

        <DialogFooter className="gap-2 sm:gap-0">
          {allowDismiss ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={confirming}
            >
              Set up later
            </Button>
          ) : null}
          <Button
            type="button"
            onClick={() => void onConfirm()}
            disabled={loading || confirming || !qrDataUrl}
          >
            {confirming ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Confirming…
              </>
            ) : (
              "Confirm Authy"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
