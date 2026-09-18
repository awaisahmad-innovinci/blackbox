"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@blackbox/ui/button";
import { Input } from "@blackbox/ui/input";
import { Label } from "@blackbox/ui/label";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  FieldStatus,
  FormError,
  FormSuccess,
  SectionCard,
} from "@/components/section-card";
import { toUserFacingError } from "@/lib/api-error";
import { totpApi } from "@/lib/totp-api";

type Props = {
  userId: string;
  canManage: boolean;
  isSelf: boolean;
};

export function TotpAuthySection({ userId, canManage, isSelf }: Props) {
  const [status, setStatus] = useState<{
    enrolled: boolean;
    confirmedAt: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [resetOpen, setResetOpen] = useState(false);

  const canSetup = isSelf || canManage;

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (isSelf) {
        setStatus(await totpApi.status());
      } else {
        setStatus(null);
      }
    } catch (err) {
      setError(toUserFacingError(err));
    } finally {
      setLoading(false);
    }
  }, [isSelf]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  async function onStartSetup() {
    if (!isSelf) return;
    setBusy(true);
    setSuccess(null);
    setError(null);
    try {
      const start = await totpApi.enrollStart();
      setQrDataUrl(start.qrDataUrl);
      setCode("");
    } catch (err) {
      setError(toUserFacingError(err));
    } finally {
      setBusy(false);
    }
  }

  async function onConfirm() {
    if (!isSelf || !/^\d{6}$/.test(code.trim())) {
      setError("Enter the 6-digit code from Authy");
      return;
    }
    setBusy(true);
    setSuccess(null);
    setError(null);
    try {
      const next = await totpApi.enrollConfirm(code.trim());
      setStatus(next);
      setQrDataUrl(null);
      setCode("");
      setSuccess("Authy configured.");
    } catch (err) {
      setError(toUserFacingError(err));
    } finally {
      setBusy(false);
    }
  }

  async function onReset() {
    setBusy(true);
    setSuccess(null);
    setError(null);
    try {
      if (isSelf) await totpApi.resetSelf();
      else await totpApi.resetUser(userId);
      setStatus(isSelf ? { enrolled: false, confirmedAt: null } : null);
      setQrDataUrl(null);
      setCode("");
      setResetOpen(false);
      setSuccess("Authy reset. Set up again when ready.");
    } catch (err) {
      setError(toUserFacingError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard
      title="Authy (supervisor codes)"
      description="Manager and Owner accounts can generate Authy codes used on POS to approve removing sale lines."
    >
      <FormSuccess>{success}</FormSuccess>
      <FormError>{error}</FormError>

      {loading ? (
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" />
          Loading Authy status…
        </p>
      ) : isSelf && status ? (
        <div className="space-y-4">
          {status.enrolled ? (
            <p className="text-sm">
              Authy is configured
              {status.confirmedAt
                ? ` (since ${new Date(status.confirmedAt).toLocaleString()})`
                : ""}
              .
            </p>
          ) : qrDataUrl ? (
            <div className="space-y-4">
              {/* eslint-disable-next-line @next/next/no-img-element -- QR is an inline data URL from the API */}
              <img
                src={qrDataUrl}
                alt="Authy QR code"
                className="border-border size-48 rounded-md border bg-white p-2"
              />
              <div className="space-y-2">
                <Label htmlFor="webTotpCode">Verification code</Label>
                <Input
                  id="webTotpCode"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(e) =>
                    setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                />
                <FieldStatus hint="Enter the code shown in Authy after scanning." />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button disabled={busy} onClick={() => void onConfirm()}>
                  Confirm Authy
                </Button>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setQrDataUrl(null);
                    setCode("");
                  }}
                >
                  Cancel setup
                </Button>
              </div>
            </div>
          ) : (
            <Button disabled={busy || !canSetup} onClick={() => void onStartSetup()}>
              Set up Authy
            </Button>
          )}

          {status.enrolled && canSetup ? (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setResetOpen(true)}
            >
              Reset and set up again
            </Button>
          ) : null}
        </div>
      ) : !isSelf && canManage ? (
        <div className="space-y-3">
          <p className="text-muted-foreground text-sm">
            Reset this user&apos;s Authy enrollment so they can scan a new QR code
            on web or desktop.
          </p>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => setResetOpen(true)}
          >
            Reset Authy
          </Button>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          Only the account owner can complete Authy setup on web.
        </p>
      )}

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Reset Authy?"
        description="Existing Authy codes for this account will stop working. A new QR setup is required before POS line removal works offline."
        confirmLabel="Reset Authy"
        destructive
        loading={busy}
        onConfirm={onReset}
      />
    </SectionCard>
  );
}
